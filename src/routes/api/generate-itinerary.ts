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
  generateTripInputSchema,
  GEMINI_STREAM_MAX_BATCHES,
  nextIncompleteDayRange,
  streamBatchSizeWithTimeLeft,
  type GenerateGeminiProTripInput,
} from "@/lib/geminiPro.functions";
import { createTripPlanStream } from "@/lib/geminiPro";
import { partialTripPlanToPreviewPlan } from "@/lib/geminiStreamMap";
import {
  applyFlightContextIfPresent,
  buildCatalogPlanFromResponse,
  buildGeminiMapOpts,
  finalizeMergedStreamPlan,
} from "@/lib/geminiProCatalog";
import {
  alignBatchDays,
  mergeStreamedTripPlans,
  maxPlanDayNumber,
  planLastCity,
  planVisitedCities,
  streamBatchWindowReady,
  streamPartialPastItinerary,
} from "@/lib/geminiStreamBatches";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { optionalSupabaseAuthRequest } from "@/lib/supabaseRequestAuth.server";
import { enforceItineraryQuota, recordPlanGeneration } from "@/lib/quota.server";

const generateInput = generateTripInputSchema;

type StreamEvent =
  | { type: "partial"; plan: unknown; dayCount: number; expectedDays: number }
  | { type: "ping"; dayCount: number; expectedDays: number }
  | { type: "done"; plan: unknown }
  | { type: "error"; error: string };

/** Keep client idle watchdog alive while Gemini refines the same day (no new dayCount). */
const PING_EVERY_MS = 20_000;
/** Don't start another Gemini batch if the hard cap is already gone. */
const MIN_MS_FOR_NEXT_BATCH = 20_000;

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

              stallWatchdog.clear();
              if (abortSignal.aborted) {
                push({ type: "error", error: "error.planTimeout" });
                return;
              }

              const pax = data.pax.adults + data.pax.childrenAges.length;
              let accumulated: AiTripPlan | null = null;
              const loopStarted = Date.now();
              let noProgressStreak = 0;

              const mergePush = (
                incoming: AiTripPlan | null | undefined,
                stampFlights: boolean,
                force = false,
              ) => {
                if (!incoming?.days.length) return;
                const merged = mergeStreamedTripPlans(accumulated, incoming, pax);
                if (stampFlights) applyFlightContextIfPresent(merged, data);
                accumulated = merged;
                const dayCount = merged.days.length;
                if (force || dayCount > lastDayCount) {
                  lastDayCount = Math.max(lastDayCount, dayCount);
                  push({
                    type: "partial",
                    plan: merged,
                    dayCount,
                    expectedDays,
                  });
                }
              };

              stallWatchdog.clear();
              const baseParams = await buildGeminiTripPlanParamsWithAttachment(
                data,
                expectedDays,
              );
              if (abortSignal.aborted) {
                push({ type: "error", error: "error.planTimeout" });
                return;
              }

              for (let batch = 0; batch < GEMINI_STREAM_MAX_BATCHES; batch++) {
                if (abortSignal.aborted) break;
                if (
                  accumulated &&
                  hasAcceptablePlanDayCoverage(accumulated.days.length, expectedDays)
                ) {
                  break;
                }

                const elapsed = Date.now() - loopStarted;
                const size = streamBatchSizeWithTimeLeft(
                  expectedDays,
                  elapsed,
                  GEMINI_STREAM_HARD_MS,
                );
                const range = nextIncompleteDayRange(
                  maxPlanDayNumber(accumulated?.days) || accumulated?.days.length || 0,
                  expectedDays,
                  size,
                );
                if (!range) break;

                if (batch > 0 && elapsed > GEMINI_STREAM_HARD_MS - MIN_MS_FOR_NEXT_BATCH) {
                  pipelineLog(
                    "stream:generate-itinerary SKIP_BATCH",
                    `not enough time for days ${range.start}-${range.end}`,
                  );
                  break;
                }

                stallWatchdog.clear();
                if (abortSignal.aborted) break;
                const planParams = {
                  ...baseParams,
                  dayRange: {
                    start: range.start,
                    end: range.end,
                    visitedCities: planVisitedCities(accumulated),
                    lastCity: planLastCity(accumulated),
                  },
                };

                pipelineLog(
                  "stream:generate-itinerary BATCH",
                  `${range.start}-${range.end} / ${expectedDays}`,
                );
                stallWatchdog.bump();
                const daysBefore = accumulated?.days.length ?? 0;

                try {
                  const batchAbort = new AbortController();
                  const batchSignal = mergeAbortSignals(abortSignal, batchAbort.signal);
                  const result = createTripPlanStream(planParams, { abortSignal: batchSignal });
                  let windowReady = false;

                  for await (const partial of result.partialObjectStream) {
                    if (abortSignal.aborted) break;
                    stallWatchdog.bump();
                    const preview = partialTripPlanToPreviewPlan(partial, {
                      ...mapOpts,
                      enrich: false,
                    });
                    if (!preview?.days.length) continue;
                    mergePush(alignBatchDays(preview, range), false);
                    const gotMax = maxPlanDayNumber(accumulated?.days);
                    if (
                      streamBatchWindowReady(accumulated?.days, range) ||
                      maxPlanDayNumber(preview.days) > range.end ||
                      (gotMax >= range.end && streamPartialPastItinerary(partial))
                    ) {
                      windowReady = true;
                      if (accumulated) {
                        applyFlightContextIfPresent(accumulated, data);
                        mergePush(accumulated, false, true);
                      }
                      batchAbort.abort();
                      break;
                    }
                  }

                  if (abortSignal.aborted) break;

                  if (!windowReady) {
                    try {
                      const finalObject = await result.object;
                      const built = buildCatalogPlanFromResponse(finalObject, data, {
                        expandToExpectedDays: false,
                      });
                      if (built.plan) mergePush(alignBatchDays(built.plan, range), true);
                    } catch (objectErr) {
                      pipelineLog(
                        "stream:generate-itinerary BATCH_OBJECT",
                        objectErr instanceof Error ? objectErr.message : "truncated",
                      );
                    }
                  } else {
                    pipelineLog(
                      "stream:generate-itinerary BATCH_CUT",
                      `days ${range.start}-${range.end} ready — skip leftover JSON`,
                    );
                  }
                } catch (batchErr) {
                  const cutEarly =
                    batchErr instanceof Error &&
                    (batchErr.name === "AbortError" || /abort/i.test(batchErr.message));
                  if (!cutEarly) {
                    pipelineLog(
                      "stream:generate-itinerary BATCH_FAIL",
                      batchErr instanceof Error ? batchErr.message : "error",
                    );
                  }
                  if (abortSignal.aborted) break;
                }

                const daysAfter = accumulated?.days.length ?? 0;
                if (daysAfter <= daysBefore) {
                  noProgressStreak += 1;
                  pipelineLog("stream:generate-itinerary NO_PROGRESS", `${daysAfter} days`);
                  if (noProgressStreak >= 2) break;
                  continue;
                }
                noProgressStreak = 0;
              }

              if (
                accumulated &&
                hasAcceptablePlanDayCoverage(accumulated.days.length, expectedDays)
              ) {
                const finalPlan = finalizeMergedStreamPlan(accumulated, data);
                await recordPlanGeneration(userId, quota.tier, request);
                push({ type: "done", plan: finalPlan });
                pipelineLog(
                  "stream:generate-itinerary DONE",
                  `${finalPlan.days.length} days`,
                );
                return;
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

              const got = accumulated?.days.length ?? 0;
              if (accumulated) applyFlightContextIfPresent(accumulated, data);
              const msg = incompletePlanDayCoverageMessage(got, expectedDays);
              pipelineLog("stream:generate-itinerary INCOMPLETE", msg);
              push({ type: "error", error: msg });
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
