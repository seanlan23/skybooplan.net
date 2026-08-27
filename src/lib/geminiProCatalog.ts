import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import {
  buildGeminiMapOpts,
  itineraryJsonToPlan,
} from "@/lib/generateItinerary";
import { type GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";

export { buildGeminiMapOpts };

export function buildCatalogPlanFromResponse(
  raw: TripPlanResponse,
  data: GenerateGeminiProTripInput,
  _opts?: { expandToExpectedDays?: boolean },
): { plan: AiTripPlan | null; error: string | null } {
  const plan = itineraryJsonToPlan(raw, data);
  if (!plan) {
    return {
      plan: null,
      error: "Načrt ni bil generiran v veljavni obliki (manjkajo mesto ali koordinate).",
    };
  }
  return { plan, error: null };
}

/** Itinerary JSON is not rewritten after the model returns. */
export async function repairCatalogPlanIfNeeded(
  plan: AiTripPlan,
  _data?: Pick<GenerateGeminiProTripInput, "language">,
): Promise<AiTripPlan> {
  return plan;
}

export function finalizeMergedStreamPlan(plan: AiTripPlan): AiTripPlan {
  return plan;
}
