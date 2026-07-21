import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import { tripPlanSchema } from "@/lib/geminiPro.shared";
import { enrichGroundTransportPlan } from "@/lib/groundTransport";
import {
  enrichGeminiCatalogPlan,
  isCatalogTripPlan,
  tripPlanResponseToAiTripPlan,
} from "@/lib/geminiPlanMap";
import { applyFlightContextToGeminiPlan } from "@/lib/geminiFlightContext";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import type { Lang } from "@/lib/i18n";

export function buildCatalogPlanFromResponse(
  raw: TripPlanResponse,
  data: GenerateGeminiProTripInput,
): { plan: AiTripPlan | null; error: string | null } {
  const parsed = tripPlanSchema.safeParse(raw);
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

  enrichGeminiCatalogPlan(catalogPlan, {
    budget: data.budget,
    pax: data.pax.adults + data.pax.childrenAges.length,
    wishesText,
    language: data.language,
  });

  enrichGroundTransportPlan(catalogPlan, {
    mode: data.groundTransportMode,
    originPlace: data.originPlace,
    destinationPlace: data.destinationPlace,
  });

  applyFlightContextIfPresent(catalogPlan, data);

  return { plan: catalogPlan, error: null };
}

/** Shared by final catalog + live stream partials — boarding-pass times always win. */
export function applyFlightContextIfPresent(
  plan: AiTripPlan,
  data: Pick<
    GenerateGeminiProTripInput,
    "flightContext" | "groundTransportMode" | "originIata" | "language"
  >,
): void {
  if (!data.flightContext || data.groundTransportMode) return;
  applyFlightContextToGeminiPlan(plan, data.flightContext, {
    originIata: data.originIata,
    language: data.language ?? "sl",
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
    language: (data.language ?? "sl") as Lang,
    budget: data.budget,
    pax: data.pax.adults + data.pax.childrenAges.length,
  };
}
