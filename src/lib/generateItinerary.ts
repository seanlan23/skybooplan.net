import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { geminiApiKey } from "@/lib/llm";
import { parseCoercedTripPlan } from "@/lib/geminiPro.shared";
import {
  isCatalogTripPlan,
  tripPlanResponseToAiTripPlan,
} from "@/lib/geminiPlanMap";
import { finalizeItineraryMapCoords } from "@/lib/itineraryMapModel";
import {
  buildGeminiTripPlanParamsWithAttachment,
  tripDayCount,
  type GenerateGeminiProTripInput,
} from "@/lib/geminiPro.functions";
import { createTripPlanStream, generateTripPlan } from "@/lib/geminiPro";
import { normalizePlanLangCode } from "@/lib/planLanguages";

export function buildGeminiMapOpts(userInputs: GenerateItineraryInput) {
  const wishesText = [
    userInputs.customWishes?.trim(),
    userInputs.wishTags.join(" "),
    userInputs.priorities?.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    originIata: userInputs.originIata,
    destinationIata: userInputs.destinationIata,
    departDate: userInputs.departDate,
    wishesText,
    groundTransportMode: userInputs.groundTransportMode,
    originPlace: userInputs.originPlace,
    destinationPlace: userInputs.destinationPlace,
    inboundDepart: userInputs.flightContext?.inboundDepart,
    inboundArrive: userInputs.flightContext?.inboundArrive,
    arrivalDay: 1 + (userInputs.flightContext?.outboundArriveDayOffset ?? 0),
    language: normalizePlanLangCode(userInputs.language ?? "sl"),
    budget: userInputs.budget,
    pax: userInputs.pax.adults + userInputs.pax.childrenAges.length,
    pace: userInputs.pace,
  };
}

export type GenerateItineraryInput = GenerateGeminiProTripInput;

export type GenerateItineraryResult = {
  plan: AiTripPlan | null;
  error: string | null;
};

/**
 * Field copy only: Gemini structured JSON → UI/PDF `AiTripPlan`.
 * Live system rules: `CORE_ITINERARY_SYSTEM_RULES` (sleep city, clock order,
 * no prompt leaks, one transfer, unique tips, linear route, time slots, SL copy).
 * No day padding or route repair.
 */
export { CORE_ITINERARY_SYSTEM_RULES } from "@/lib/coreItineraryRules";
export type { ActivityItem, ItineraryDayPlan } from "@/lib/itineraryDayContract";
export function itineraryJsonToPlan(
  raw: unknown,
  userInputs: GenerateItineraryInput,
): AiTripPlan | null {
  const parsed = parseCoercedTripPlan(raw);
  if (!parsed.success) return null;
  const plan = tripPlanResponseToAiTripPlan(parsed.data, buildGeminiMapOpts(userInputs));
  if (!isCatalogTripPlan(plan)) return null;
  finalizeItineraryMapCoords(plan);
  return plan;
}

/** One structured Gemini call for the full calendar. JSON is mapped, not rewritten. */
export async function generateItinerary(
  userInputs: GenerateItineraryInput,
): Promise<GenerateItineraryResult> {
  if (!geminiApiKey()) {
    return { plan: null, error: "GEMINI_API_KEY ni nastavljen na strežniku." };
  }

  try {
    const days = tripDayCount(userInputs.departDate, userInputs.returnDate);
    const params = await buildGeminiTripPlanParamsWithAttachment(userInputs, days);
    const raw = await generateTripPlan(params);
    const plan = itineraryJsonToPlan(raw, userInputs);
    if (!plan) {
      return {
        plan: null,
        error: "Načrt ni bil generiran v veljavni obliki.",
      };
    }
    return { plan, error: null };
  } catch (err) {
    return {
      plan: null,
      error: err instanceof Error ? err.message : "Napaka pri generiranju načrta.",
    };
  }
}

/** Same one-shot call as `generateItinerary`, streamed for the HTTP itinerary route. */
export function streamGenerateItinerary(
  userInputs: GenerateItineraryInput,
  options?: { abortSignal?: AbortSignal },
) {
  const days = tripDayCount(userInputs.departDate, userInputs.returnDate);
  return buildGeminiTripPlanParamsWithAttachment(userInputs, days).then((params) =>
    createTripPlanStream(params, options),
  );
}
