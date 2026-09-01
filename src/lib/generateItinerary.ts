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
import { isSingleBasePayload } from "@/lib/singleBaseContract";
import { singleBaseJsonToPlan } from "@/lib/singleBasePlanMap";
import { isDayByDayTripStyle, resolveTripStyle, type TripStyle } from "@/lib/tripStyle";
import { stabilizeTripStayStructure } from "@/lib/tripStayStructure";

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
    travelStyle: userInputs.travelStyle,
    tripStyle: userInputs.tripStyle,
    returnDate: userInputs.returnDate,
  };
}

export type GenerateItineraryInput = GenerateGeminiProTripInput;

export type GenerateItineraryResult = {
  plan: AiTripPlan | null;
  error: string | null;
};

/**
 * Gemini structured JSON → UI/PDF `AiTripPlan`, then code stay-structure:
 * hotel-base cap (`enforceTripBaseCap`) + last-day clock order
 * (`sortDepartureDayChronology`). Not prompt sentences.
 */
export { CORE_ITINERARY_SYSTEM_RULES } from "@/lib/coreItineraryRules";
export type { ActivityItem, ItineraryDayPlan } from "@/lib/itineraryDayContract";
export type { TripStyle } from "@/lib/tripStyle";
export type {
  ArrivalProtocol,
  DepartureProtocol,
  OptionalExcursion,
  ResortGuide,
  SingleBasePlan,
} from "@/lib/singleBaseContract";
export function itineraryJsonToPlan(
  raw: unknown,
  userInputs: GenerateItineraryInput,
): AiTripPlan | null {
  const opts = buildGeminiMapOpts(userInputs);
  const style = resolveTripStyle(userInputs);
  const rawObj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const hasDayItinerary = Boolean(
    (Array.isArray(rawObj?.days) && rawObj.days.length > 0) ||
      (Array.isArray(rawObj?.itinerar) && rawObj.itinerar.length > 0),
  );
  const useSingleBase =
    !isDayByDayTripStyle(style) &&
    (isSingleBasePayload(raw) || (style === "single_base" && !hasDayItinerary));
  if (useSingleBase) {
    const plan = singleBaseJsonToPlan(raw, opts);
    if (!plan || !isCatalogTripPlan(plan)) return null;
    finalizeItineraryMapCoords(plan);
    return stampFlightContext(applyRequestedTripStyle(plan, style), userInputs);
  }
  const parsed = parseCoercedTripPlan(raw);
  if (!parsed.success) return null;
  const plan = tripPlanResponseToAiTripPlan(parsed.data, opts);
  if (!isCatalogTripPlan(plan)) return null;
  finalizeItineraryMapCoords(plan);
  const stamped = stampFlightContext(applyRequestedTripStyle(plan, style), userInputs);
  return stabilizeTripStayStructure(stamped, {
    inboundDepart: userInputs.flightContext?.inboundDepart,
    inboundArrive: userInputs.flightContext?.inboundArrive,
    language: opts.language,
    originIata: userInputs.originIata,
    calendarDays: tripDayCount(userInputs.departDate, userInputs.returnDate),
  });
}

export { stabilizeTripStayStructure } from "@/lib/tripStayStructure";

function applyRequestedTripStyle(plan: AiTripPlan, style: TripStyle): AiTripPlan {
  if (style === "single_base") return { ...plan, tripStyle: style };
  const { resortStay: _leaked, ...rest } = plan;
  return { ...rest, tripStyle: style };
}

function stampFlightContext(
  plan: AiTripPlan,
  userInputs: GenerateItineraryInput,
): AiTripPlan {
  if (!userInputs.flightContext) return plan;
  return { ...plan, flightContext: userInputs.flightContext };
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
