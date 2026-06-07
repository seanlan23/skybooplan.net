import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import { tripPlanSchema } from "@/lib/geminiPro.shared";
import { enrichIslandAirportTransfers } from "@/lib/islandAirportTransfers";
import { enrichGroundTransportPlan } from "@/lib/groundTransport";
import {
  enrichGeminiCatalogPlan,
  isCatalogTripPlan,
  tripPlanResponseToAiTripPlan,
} from "@/lib/geminiPlanMap";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";

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
    originIata: data.originIata,
    destinationIata: data.destinationIata,
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
  });

  enrichIslandAirportTransfers(catalogPlan, {
    destinationIata: data.destinationIata,
  });

  enrichGroundTransportPlan(catalogPlan, {
    mode: data.groundTransportMode,
    originPlace: data.originPlace,
    destinationPlace: data.destinationPlace,
  });

  return { plan: catalogPlan, error: null };
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
    wishesText,
    groundTransportMode: data.groundTransportMode,
    originPlace: data.originPlace,
    destinationPlace: data.destinationPlace,
  };
}
