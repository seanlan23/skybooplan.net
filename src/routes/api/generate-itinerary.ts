import { createFileRoute } from "@tanstack/react-router";
import { pipelineLog } from "@/lib/asyncTimeout";
import { geminiApiKey } from "@/lib/llm";
import {
  tripDayCount,
  buildGeminiTripPlanParams,
  formatGenerateTripInputError,
  generateGeminiProTripInputSchema,
  type GenerateGeminiProTripInput,
} from "@/lib/geminiPro.functions";
import { createTripPlanStream } from "@/lib/geminiPro";
import { partialTripPlanToPreviewPlan } from "@/lib/geminiStreamMap";
import {
  buildCatalogPlanFromResponse,
  buildGeminiMapOpts,
} from "@/lib/geminiProCatalog";
import { requireSupabaseAuthRequest } from "@/lib/supabaseRequestAuth.server";
import { enforceItineraryQuota, recordPlanGeneration } from "@/lib/quota.server";

const generateInput = generateGeminiProTripInputSchema.transform((data) => ({
  ...data,
  originIata: data.originIata ?? "LJU",
  destinationIata: data.destinationIata ?? "FCO",
}));

type StreamEvent =
  | { type: "partial"; plan: unknown; dayCount: number; expectedDays: number }
  | { type: "done"; plan: unknown }
  | { type: "error"; error: string };

function ndjson(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export const Route = createFileRoute("/api/generate-itinerary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authResult = await requireSupabaseAuthRequest(request);
        if (!authResult.ok) return authResult.response;

        const { userId } = authResult.auth;

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

            try {
              pipelineLog("stream:generate-itinerary START", `${data.originIata}→${data.destinationIata}`);

              const result = createTripPlanStream(buildGeminiTripPlanParams(data, expectedDays));

              let lastDayCount = 0;
              for await (const partial of result.partialObjectStream) {
                const preview = partialTripPlanToPreviewPlan(partial, mapOpts);
                const dayCount = preview?.days.length ?? 0;
                if (preview && dayCount > lastDayCount) {
                  lastDayCount = dayCount;
                  push({
                    type: "partial",
                    plan: preview,
                    dayCount,
                    expectedDays,
                  });
                }
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
              push({
                type: "error",
                error:
                  err instanceof Error
                    ? err.message
                    : "Napaka pri generiranju načrta preko Gemini Pro",
              });
            } finally {
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
