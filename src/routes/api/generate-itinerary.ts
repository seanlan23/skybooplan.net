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
  formatGenerateTripInputError,
  generateTripInputSchema,
  tripDayCount,
  type GenerateGeminiProTripInput,
} from "@/lib/geminiPro.functions";
import { extractGeneratedObject } from "@/lib/geminiPro";
import { buildGeminiMapOpts, itineraryJsonToPlan, streamGenerateItinerary } from "@/lib/generateItinerary";
import { partialTripPlanToPreviewPlan } from "@/lib/geminiStreamMap";
import { optionalSupabaseAuthRequest } from "@/lib/supabaseRequestAuth.server";
import { enforceItineraryQuota, recordPlanGeneration } from "@/lib/quota.server";
import type { AiTripPlan } from "@/lib/aiPlan.functions";

const generateInput = generateTripInputSchema;

type StreamEvent =
  | { type: "partial"; plan: unknown; dayCount: number; expectedDays: number }
  | { type: "ping"; dayCount: number; expectedDays: number }
  | { type: "done"; plan: unknown }
  | { type: "error"; error: string };

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

              stallWatchdog.clear();
              if (abortSignal.aborted) {
                push({ type: "error", error: "error.planTimeout" });
                return;
              }

              const result = await streamGenerateItinerary(data, { abortSignal });
              let lastRaw: unknown = null;
              let preview: AiTripPlan | null = null;

              for await (const partial of result.partialObjectStream) {
                lastRaw = partial;
                if (abortSignal.aborted) break;
                stallWatchdog.bump();
                const next = partialTripPlanToPreviewPlan(partial, {
                  ...mapOpts,
                  enrich: false,
                });
                if (!next?.days.length) continue;
                preview = next;
                const dayCount = next.days.length;
                if (dayCount > lastDayCount) {
                  lastDayCount = dayCount;
                  push({
                    type: "partial",
                    plan: next,
                    dayCount,
                    expectedDays,
                  });
                }
              }

              if (abortSignal.aborted) {
                push({
                  type: "error",
                  error:
                    lastDayCount > 0
                      ? `error.planTimeoutPartial:${lastDayCount}`
                      : "error.planTimeout",
                });
                return;
              }

              let finalPlan: AiTripPlan | null = null;
              try {
                const object = await result.object;
                finalPlan = itineraryJsonToPlan(object, data);
              } catch (objectErr) {
                pipelineLog(
                  "stream:generate-itinerary OBJECT",
                  objectErr instanceof Error ? objectErr.message : "truncated",
                );
                finalPlan = itineraryJsonToPlan(
                  extractGeneratedObject(objectErr) ?? lastRaw,
                  data,
                );
              }

              const plan = finalPlan ?? preview;
              if (plan?.days.length) {
                await recordPlanGeneration(userId, quota.tier, request);
                push({ type: "done", plan });
                pipelineLog(
                  "stream:generate-itinerary DONE",
                  `${plan.days.length} days`,
                );
                return;
              }

              push({ type: "error", error: "Načrt ni bil generiran v veljavni obliki." });
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
