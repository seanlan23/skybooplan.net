import { createFileRoute } from "@tanstack/react-router";
import {
  createStallWatchdog,
  GEMINI_STREAM_HARD_MS,
  GEMINI_STREAM_STALL_MS,
  mergeAbortSignals,
  pipelineLog,
} from "@/lib/asyncTimeout";
import { geminiApiKey } from "@/lib/llm";
import {
  tripDayCount,
  hasAcceptablePlanDayCoverage,
  incompletePlanDayCoverageMessage,
  buildGeminiTripPlanParamsWithAttachment,
  formatGenerateTripInputError,
  generateGeminiProTripInputSchema,
  type GenerateGeminiProTripInput,
} from "@/lib/geminiPro.functions";
import { createTripPlanStream } from "@/lib/geminiPro";
import { partialTripPlanToPreviewPlan } from "@/lib/geminiStreamMap";
import {
  applyFlightContextIfPresent,
  buildCatalogPlanFromResponse,
  buildGeminiMapOpts,
} from "@/lib/geminiProCatalog";
import { optionalSupabaseAuthRequest } from "@/lib/supabaseRequestAuth.server";
import { enforceItineraryQuota, recordPlanGeneration } from "@/lib/quota.server";

const generateInput = generateGeminiProTripInputSchema.transform((data) => ({
  ...data,
  originIata: data.originIata ?? "LJU",
  destinationIata: data.destinationIata ?? "FCO",
}));

type StreamEvent =
  | { type: "partial"; plan: unknown; dayCount: number; expectedDays: number }
  | { type: "ping"; dayCount: number; expectedDays: number }
  | { type: "done"; plan: unknown }
  | { type: "error"; error: string };

/** Keep client idle watchdog alive while Gemini refines the same day (no new dayCount). */
const PING_EVERY_MS = 20_000;

function ndjson(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export const Route = createFileRoute("/api/generate-itinerary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authResult = await optionalSupabaseAuthRequest(request);
        if (!authResult.ok) return authResult.response;

        const userId = authResult.userId;
        const email =
          typeof authResult.auth?.claims?.email === "string"
            ? authResult.auth.claims.email
            : null;

        const quota = await enforceItineraryQuota(request, userId, email);
        if (!quota.ok) return quota.response;

        if (!geminiApiKey()) {
          return Response.json(
            { error: "GEMINI_API_KEY ni nastavljen na strežniku." },
            { status: 503 },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Neveljaven JSON." }, { status: 400 });
        }

        const parsedInput = generateInput.safeParse(body);
        if (!parsedInput.success) {
          console.warn("[generate-itinerary] invalid input", parsedInput.error.flatten());
          return Response.json(
            { error: formatGenerateTripInputError(parsedInput.error) },
            { status: 400 },
          );
        }

        const data = parsedInput.data as GenerateGeminiProTripInput;
        const expectedDays = tripDayCount(data.departDate, data.returnDate);
        const mapOpts = buildGeminiMapOpts(data);

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const push = (event: StreamEvent) => controller.enqueue(ndjson(event));
            const hardAbort = new AbortController();
            const hardTimer = setTimeout(() => hardAbort.abort(), GEMINI_STREAM_HARD_MS);
            const stallWatchdog = createStallWatchdog(GEMINI_STREAM_STALL_MS, hardAbort.signal);
            const abortSignal = mergeAbortSignals(
              hardAbort.signal,
              stallWatchdog.signal,
              request.signal,
            );

            let heartbeat: ReturnType<typeof setInterval> | undefined;
            try {
              pipelineLog(
                "stream:generate-itinerary START",
                `${data.originIata}→${data.destinationIata} (${expectedDays}d)`,
              );

              // Immediate keepalive — client idle watchdog must not wait for Gemini TTFB.
              let lastDayCount = 0;
              push({ type: "ping", dayCount: 0, expectedDays });
              heartbeat = setInterval(() => {
                if (hardAbort.signal.aborted) return;
                try {
                  push({ type: "ping", dayCount: lastDayCount, expectedDays });
                } catch {
                  /* stream already closed */
                }
              }, PING_EVERY_MS);

              // Stall clock is for Gemini silence — pause while building prompt/attachments.
              stallWatchdog.clear();
              const planParams = await buildGeminiTripPlanParamsWithAttachment(data, expectedDays);
              if (abortSignal.aborted) {
                push({ type: "error", error: "error.planTimeout" });
                return;
              }
              stallWatchdog.bump();
              const result = createTripPlanStream(planParams, { abortSignal });

              for await (const partial of result.partialObjectStream) {
                if (abortSignal.aborted) break;
                stallWatchdog.bump();
                // Light map only — heavy enrich on every Gemini token batch stalls 10+ day trips.
                const preview = partialTripPlanToPreviewPlan(partial, {
                  ...mapOpts,
                  enrich: false,
                });
                const dayCount = preview?.days.length ?? 0;
                if (preview && dayCount > lastDayCount) {
                  // Apply flight rewrite on EVERY new day — otherwise UI shows Phuket
                  // breakfast + Munich airport on day 1 while "Generiram… 10/16".
                  applyFlightContextIfPresent(preview, data);
                  lastDayCount = dayCount;
                  push({
                    type: "partial",
                    plan: preview,
                    dayCount,
                    expectedDays,
                  });
                }
                // Heartbeat interval covers silence while Gemini polishes the same day.
              }

              if (abortSignal.aborted) {
                const reason =
                  lastDayCount > 0
                    ? `error.planTimeoutPartial:${lastDayCount}`
                    : "error.planTimeout";
                pipelineLog("stream:generate-itinerary ABORT", reason);
                push({ type: "error", error: reason });
                return;
              }

              const finalObject = await result.object;
              const built = buildCatalogPlanFromResponse(finalObject, data);
              if (built.error || !built.plan) {
                push({ type: "error", error: built.error ?? "Načrt ni bil generiran." });
              } else if (
                !hasAcceptablePlanDayCoverage(built.plan.days.length, expectedDays)
              ) {
                const msg = incompletePlanDayCoverageMessage(
                  built.plan.days.length,
                  expectedDays,
                );
                pipelineLog("stream:generate-itinerary INCOMPLETE", msg);
                push({ type: "error", error: msg });
              } else {
                await recordPlanGeneration(userId, quota.tier, request);
                push({ type: "done", plan: built.plan });
              }

              pipelineLog("stream:generate-itinerary DONE", `${built.plan?.days.length ?? 0} days`);
            } catch (err) {
              console.error("[generate-itinerary] stream failed:", err);
              const aborted = abortSignal.aborted;
              push({
                type: "error",
                error: aborted
                  ? "error.planTimeout"
                  : err instanceof Error
                    ? err.message
                    : "error.planGenerationFailed",
              });
            } finally {
              if (heartbeat !== undefined) clearInterval(heartbeat);
              stallWatchdog.clear();
              clearTimeout(hardTimer);
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
