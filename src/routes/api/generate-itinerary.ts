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

        const quota = await enforceItineraryQuota(request, userId);
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

            try {
              pipelineLog(
                "stream:generate-itinerary START",
                `${data.originIata}→${data.destinationIata} (${expectedDays}d)`,
              );

              const planParams = await buildGeminiTripPlanParamsWithAttachment(data, expectedDays);
              const result = createTripPlanStream(planParams, { abortSignal });

              let lastDayCount = 0;
              let lastPingAt = 0;
              for await (const partial of result.partialObjectStream) {
                if (abortSignal.aborted) break;
                stallWatchdog.bump();
                const preview = partialTripPlanToPreviewPlan(partial, mapOpts);
                const dayCount = preview?.days.length ?? 0;
                if (preview && dayCount > lastDayCount) {
                  // Apply flight rewrite on EVERY partial — otherwise UI shows Phuket
                  // breakfast + Munich airport on day 1 while "Generiram… 10/16".
                  applyFlightContextIfPresent(preview, data);
                  lastDayCount = dayCount;
                  lastPingAt = Date.now();
                  push({
                    type: "partial",
                    plan: preview,
                    dayCount,
                    expectedDays,
                  });
                } else {
                  // Gemini often spends >100s polishing one day without increasing dayCount.
                  // Without bytes on the wire, the client idle timer aborts the stream.
                  const now = Date.now();
                  if (now - lastPingAt >= PING_EVERY_MS) {
                    lastPingAt = now;
                    push({
                      type: "ping",
                      dayCount: lastDayCount,
                      expectedDays,
                    });
                  }
                }
              }

              if (abortSignal.aborted) {
                const reason =
                  lastDayCount > 0
                    ? `Generiranje se je ustavilo po ${lastDayCount}. dnevu (Gemini ni več odgovarjal). Poskusi znova ali krajši izlet.`
                    : "Generiranje načrta je predolgo trajalo brez odgovora. Poskusi znova.";
                pipelineLog("stream:generate-itinerary ABORT", reason);
                push({ type: "error", error: reason });
                return;
              }

              const finalObject = await result.object;
              const built = buildCatalogPlanFromResponse(finalObject, data);
              if (built.error || !built.plan) {
                push({ type: "error", error: built.error ?? "Načrt ni bil generiran." });
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
                  ? "Generiranje načrta je predolgo trajalo brez odgovora. Poskusi znova."
                  : err instanceof Error
                    ? err.message
                    : "Napaka pri generiranju načrta preko Gemini Pro",
              });
            } finally {
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
