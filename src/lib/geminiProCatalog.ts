import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import { parseCoercedTripPlan, tripPlanSchema } from "@/lib/geminiPro.shared";
import { enrichGroundTransportPlan } from "@/lib/groundTransport";
import {
  enrichGeminiCatalogPlan,
  isCatalogTripPlan,
  tripPlanResponseToAiTripPlan,
} from "@/lib/geminiPlanMap";
import { applyFlightContextToGeminiPlan } from "@/lib/geminiFlightContext";
import {
  tripDayCount,
  type GenerateGeminiProTripInput,
} from "@/lib/geminiPro.functions";
import { normalizePlanLangCode } from "@/lib/planLanguages";

export function buildCatalogPlanFromResponse(
  raw: TripPlanResponse,
  data: GenerateGeminiProTripInput,
  opts?: { expandToExpectedDays?: boolean },
): { plan: AiTripPlan | null; error: string | null } {
  const parsed = parseCoercedTripPlan(raw);
  if (!parsed.success) {
    console.error("buildCatalogPlanFromResponse: validation failed", parsed.error.flatten());
    return {
      plan: null,
      error: "Načrt ni bil generiran v veljavni obliki (manjkajo mesto ali koordinate).",
    };
  }

  const wishesText = [
    data.customWishes?.trim(),
    data.wishTags.join(" "),
    data.priorities?.join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  const catalogPlan = tripPlanResponseToAiTripPlan(parsed.data, {
    ...buildGeminiMapOpts(data),
    wishesText,
  });

  if (!isCatalogTripPlan(catalogPlan)) {
    return { plan: null, error: "Načrt ni bil pretvorjen v katalog obliko." };
  }

  const missingCity = catalogPlan.days.some((d) => !(d.city ?? "").trim());
  if (missingCity) {
    return { plan: null, error: "Načrtu manjkajo angleška imena mest za hotel iskanje." };
  }

  const tripDays = tripDayCount(data.departDate, data.returnDate);
  enrichGeminiCatalogPlan(catalogPlan, {
    budget: data.budget,
    pax: data.pax.adults + data.pax.childrenAges.length,
    wishesText,
    language: data.language,
    departDate: data.departDate,
    returnDate: data.returnDate,
    // Stream batches must not clone-pad to the full trip — remaining days are generated next.
    expectedDays: opts?.expandToExpectedDays === false ? catalogPlan.days.length : tripDays,
    pace: data.pace,
  });

  enrichGroundTransportPlan(catalogPlan, {
    mode: data.groundTransportMode,
    originPlace: data.originPlace,
    destinationPlace: data.destinationPlace,
  });

  applyFlightContextIfPresent(catalogPlan, data);

  return { plan: catalogPlan, error: null };
}

/** Enrich a merged multi-batch stream plan without cloning missing calendar days. */
export function finalizeMergedStreamPlan(
  plan: AiTripPlan,
  data: GenerateGeminiProTripInput,
): AiTripPlan {
  const next = structuredClone(plan);
  const wishesText = [
    data.customWishes?.trim(),
    data.wishTags.join(" "),
    data.priorities?.join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  enrichGeminiCatalogPlan(next, {
    budget: data.budget,
    pax: data.pax.adults + data.pax.childrenAges.length,
    wishesText,
    language: data.language,
    departDate: data.departDate,
    returnDate: data.returnDate,
    expectedDays: next.days.length,
    pace: data.pace,
  });
  enrichGroundTransportPlan(next, {
    mode: data.groundTransportMode,
    originPlace: data.originPlace,
    destinationPlace: data.destinationPlace,
  });
  applyFlightContextIfPresent(next, data);
  return next;
}

/** Shared by final catalog + live stream partials — boarding-pass times always win. */
export function applyFlightContextIfPresent(
  plan: AiTripPlan,
  data: Pick<
    GenerateGeminiProTripInput,
    | "flightContext"
    | "groundTransportMode"
    | "originIata"
    | "language"
    | "departDate"
    | "returnDate"
  >,
): void {
  if (!data.flightContext || data.groundTransportMode) return;
  applyFlightContextToGeminiPlan(plan, data.flightContext, {
    originIata: data.originIata,
    language: plan.contentLanguage ?? data.language ?? "sl",
    expectedDays: tripDayCount(data.departDate, data.returnDate),
  });
}

export function buildGeminiMapOpts(data: GenerateGeminiProTripInput) {
  const wishesText = [
    data.customWishes?.trim(),
    data.wishTags.join(" "),
    data.priorities?.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
  return {
    originIata: data.originIata,
    destinationIata: data.destinationIata,
    departDate: data.departDate,
    wishesText,
    groundTransportMode: data.groundTransportMode,
    originPlace: data.originPlace,
    destinationPlace: data.destinationPlace,
    language: normalizePlanLangCode(data.language ?? "sl"),
    budget: data.budget,
    pax: data.pax.adults + data.pax.childrenAges.length,
    pace: data.pace,
  };
}
