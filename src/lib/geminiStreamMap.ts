import type { DeepPartial } from "ai";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import { MAP_POI_CATEGORIES } from "@/lib/mapPoiCategory";
import {
  tripPlanResponseToAiTripPlan,
  type GeminiPlanMapOpts,
  normalizeSafetyWarning,
  normalizeWeatherWidget,
  enrichGeminiCatalogPlan,
} from "@/lib/geminiPlanMap";

type PartialResponse = DeepPartial<TripPlanResponse>;

const DEFAULT_POI = {
  highlights: ["Glavni ogled", "Lokalna kultura", "Fotografiranje"],
  proTip: "Načrtuj vsaj uro za obisk te lokacije.",
  bestTimeOfDay: "Zgodaj dopoldan",
  rating: 4.3,
  reviewSummary: "Priljubljena postojanka med popotniki na tej poti.",
} as const;

function isMapCategory(value: unknown): value is (typeof MAP_POI_CATEGORIES)[number] {
  return typeof value === "string" && (MAP_POI_CATEGORIES as readonly string[]).includes(value);
}

function coercePartialResponse(partial: PartialResponse): TripPlanResponse | null {
  const itinerar = (partial.itinerar ?? [])
    .map((phase) => {
      if (!phase?.city?.trim()) return null;
      const city = phase.city.trim();

      const pois = (phase.pois ?? [])
        .map((poi) => {
          if (!poi?.name?.trim() || typeof poi.lat !== "number" || typeof poi.lng !== "number") {
            return null;
          }
          return {
            name: poi.name.trim(),
            description: poi.description?.trim() || poi.name.trim(),
            lat: poi.lat,
            lng: poi.lng,
            tripAdvisorStyleDetails: poi.tripAdvisorStyleDetails ?? { ...DEFAULT_POI },
            unsplashQuery: poi.unsplashQuery?.trim() || poi.name.trim(),
            imageUrl: poi.imageUrl,
          };
        })
        .filter(Boolean) as TripPlanResponse["itinerar"][number]["pois"];

      // Never invent a city-named POI — that stacked identical "Phuket" pins on the map.
      // Activities carry real stop names; empty pois is fine until Gemini fills them.

      const days = (phase.days ?? [])
        .map((day) => {
          if (typeof day?.day_number !== "number" || !day.title?.trim()) return null;

          const activities = (day.activities ?? [])
            .map((act, idx) => {
              if (!act?.title?.trim()) return null;
              const slots = ["dopoldan", "popoldan", "vecer"] as const;
              return {
                time: act.time?.trim() || act.arrivalTime?.trim() || "09:00",
                title: act.title.trim(),
                description: act.description?.trim() || act.title.trim(),
                category: isMapCategory(act.category) ? act.category : "sightseeing",
                timeSlot:
                  act.timeSlot === "dopoldan" ||
                  act.timeSlot === "popoldan" ||
                  act.timeSlot === "vecer"
                    ? act.timeSlot
                    : slots[idx % slots.length]!,
                // Do NOT invent 09:00/11:00 — that fights real flight times in the preview.
                arrivalTime: act.arrivalTime?.trim() || act.time?.trim() || undefined,
                departureTime: act.departureTime?.trim() || undefined,
                estimatedCostEur:
                  typeof act.estimatedCostEur === "number" ? act.estimatedCostEur : undefined,
                transport_type: act.transport_type,
                duration: act.duration?.trim(),
                coordinates:
                  act.coordinates?.lat != null && act.coordinates?.lng != null
                    ? { lat: act.coordinates.lat, lng: act.coordinates.lng }
                    : undefined,
                tripAdvisorStyleDetails: act.tripAdvisorStyleDetails,
                unsplashQuery: act.unsplashQuery?.trim(),
                imageUrl: act.imageUrl,
              };
            })
            .filter(Boolean) as TripPlanResponse["itinerar"][number]["days"][number]["activities"];

          return {
            day_number: day.day_number,
            date: day.date?.trim() || "",
            day_name: day.day_name?.trim() || day.title.trim(),
            title: day.title.trim(),
            dailyBudget: typeof day.dailyBudget === "number" ? day.dailyBudget : 0,
            drivingDistanceKm:
              typeof day.drivingDistanceKm === "number" ? day.drivingDistanceKm : 0,
            drivingDurationHours: day.drivingDurationHours?.trim() || "0h",
            travelHack: day.travelHack?.trim(),
            transportTip: day.transportTip?.trim(),
            transportation: day.transportation,
            activities,
          };
        })
        .filter(Boolean) as TripPlanResponse["itinerar"][number]["days"];

      if (days.length === 0) return null;

      return {
        phase: phase.phase?.trim() || city,
        city,
        unsplashQuery: phase.unsplashQuery?.trim() || city,
        lat: typeof phase.lat === "number" ? phase.lat : 0,
        lng: typeof phase.lng === "number" ? phase.lng : 0,
        pois,
        days,
      };
    })
    .filter(Boolean) as TripPlanResponse["itinerar"];

  if (itinerar.length === 0) return null;

  const transport = partial.logistics_and_tips?.transport;

  return {
    trip_metadata: {
      destination: partial.trip_metadata?.destination?.trim() || "Potovanje",
      season_warning: partial.trip_metadata?.season_warning?.trim() || "",
      currency: partial.trip_metadata?.currency?.trim() || "EUR",
      visa_required: partial.trip_metadata?.visa_required ?? false,
      return_flight_eu: partial.trip_metadata?.return_flight_eu,
    },
    safetyWarning: normalizeSafetyWarning(partial.safetyWarning) ?? null,
    weatherWidget: normalizeWeatherWidget(partial.weatherWidget, partial.weatherSummary),
    itinerar,
    logistics_and_tips: {
      transport: {
        flights: transport?.flights?.trim() || "",
        ferries: transport?.ferries?.trim() || "",
        city_transport: transport?.city_transport?.trim() || "",
      },
      finance: partial.logistics_and_tips?.finance?.trim() || "",
      internet: partial.logistics_and_tips?.internet?.trim() || "",
    },
    hotels: partial.hotels ?? [],
    travel_requirements: partial.travel_requirements as TripPlanResponse["travel_requirements"],
  };
}

/** Map streaming partial Gemini JSON → preview `AiTripPlan` (text only, no images). */
export function partialTripPlanToPreviewPlan(
  partial: PartialResponse,
  opts: GeminiPlanMapOpts & { enrich?: boolean },
): AiTripPlan | null {
  const coerced = coercePartialResponse(partial);
  if (!coerced) return null;
  try {
    const plan = tripPlanResponseToAiTripPlan(coerced, opts);
    // Streaming emits many partials per day — full enrich blocks the event loop and
    // makes long trips look "stuck" at 2/N. Final `done` path still enriches.
    if (opts.enrich !== false && opts.budget && opts.pax) {
      enrichGeminiCatalogPlan(plan, {
        budget: opts.budget,
        pax: opts.pax,
        wishesText: opts.wishesText,
        language: opts.language,
        pace: opts.pace,
      });
    }
    return plan;
  } catch (err) {
    console.warn("[geminiStreamMap] preview mapping failed:", err);
    return null;
  }
}
