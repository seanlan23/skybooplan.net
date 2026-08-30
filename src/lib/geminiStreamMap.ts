import type { DeepPartial } from "ai";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import { MAP_POI_CATEGORIES } from "@/lib/mapPoiCategory";
import {
  tripPlanResponseToAiTripPlan,
  type GeminiPlanMapOpts,
  normalizeSafetyWarning,
  normalizeWeatherWidget,
} from "@/lib/geminiPlanMap";
import { parseHmClock } from "@/lib/activityTime";
import { isSingleBasePayload } from "@/lib/singleBaseContract";
import { singleBaseJsonToPlan } from "@/lib/singleBasePlanMap";
import { resolveTripStyle } from "@/lib/tripStyle";
import { sameTransferBase } from "@/lib/baseTransfer";
import { normalizeTimeSlotLabel } from "@/lib/itineraryJsonSchema";

type PartialResponse = DeepPartial<TripPlanResponse>;

const SLOT_KEYS = [
  ["morning", "dopoldan"],
  ["afternoon", "popoldan"],
  ["evening", "vecer"],
] as const;

/** Gemini structured output is activities[]; nested morning/afternoon/evening still accepted. */
function flattenPartialActivities(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const out: unknown[] = [];
  for (const [key, timeSlot] of SLOT_KEYS) {
    const item = o[key];
    if (item == null) continue;
    const list = Array.isArray(item) ? item : [item];
    for (const a of list) {
      if (a && typeof a === "object") {
        out.push({ ...a, timeSlot: (a as { timeSlot?: string }).timeSlot ?? timeSlot });
      }
    }
  }
  return out;
}

function rootDaysToItinerar(partial: Record<string, unknown>): PartialResponse["itinerar"] {
  const days = partial.days;
  if (!Array.isArray(days) || days.length === 0) return undefined;
  const first = days.find((d) => d && typeof d === "object") as { city?: string } | undefined;
  const city =
    (typeof first?.city === "string" && first.city.trim()) ||
    (typeof partial.trip_title === "string" && partial.trip_title.trim()) ||
    "";
  if (!city) return undefined;
  return [{ city, days: days as never }];
}

function transferToTransportation(
  transfer: unknown,
): TripPlanResponse["itinerar"][number]["days"][number]["transportation"] | undefined {
  if (!transfer || typeof transfer !== "object") return undefined;
  const t = transfer as {
    type?: string;
    from?: string;
    to?: string;
    duration?: string;
    cost_eur?: number;
    estimatedPrice?: number;
  };
  const from = t.from?.trim() ?? "";
  const to = t.to?.trim() ?? "";
  if (!from || !to || sameTransferBase(from, to)) return undefined;
  const raw = (t.type ?? "").toLowerCase();
  const type: "flight" | "ferry" | "train" | "van" = /flight|let/.test(raw)
    ? "flight"
    : /ferry|trajekt/.test(raw)
      ? "ferry"
      : /train|vlak/.test(raw)
        ? "train"
        : "van";
  const duration = t.duration?.trim();
  return [
    {
      type,
      from: from || "—",
      to: to || "—",
      ...(duration ? { duration } : {}),
      estimatedPrice:
        typeof t.estimatedPrice === "number"
          ? t.estimatedPrice
          : typeof t.cost_eur === "number"
            ? t.cost_eur
            : 0,
    },
  ];
}

function isMapCategory(value: unknown): value is (typeof MAP_POI_CATEGORIES)[number] {
  return typeof value === "string" && (MAP_POI_CATEGORIES as readonly string[]).includes(value);
}

function coercePartialResponse(partial: PartialResponse & { days?: unknown[]; trip_title?: string }): TripPlanResponse | null {
  const fallbackCity =
    partial.trip_metadata?.destination?.trim() ||
    (typeof partial.itinerar?.[0]?.city === "string"
      ? partial.itinerar[0].city.trim()
      : "") ||
    (typeof partial.trip_title === "string" ? partial.trip_title.trim() : "");
  const itinerar = (partial.itinerar ?? rootDaysToItinerar(partial) ?? [])
    .map((phase) => {
      if (!phase) return null;
      const city = phase.city?.trim() || fallbackCity;
      if (!city) return null;

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
            tripAdvisorStyleDetails: poi.tripAdvisorStyleDetails,
            unsplashQuery: poi.unsplashQuery?.trim() || poi.name.trim(),
            imageUrl: (poi as { imageUrl?: string }).imageUrl,
          };
        })
        .filter(Boolean) as TripPlanResponse["itinerar"][number]["pois"];

      // Never invent a city-named POI — that stacked identical "Phuket" pins on the map.
      // Activities carry real stop names; empty pois is fine until Gemini fills them.

      const days = (phase.days ?? [])
        .map((day) => {
          if (typeof day?.day_number !== "number") return null;
          const dayTitle =
            day.title?.trim() ||
            (day as { day_title?: string }).day_title?.trim() ||
            `Dan ${day.day_number}`;

          const activities = flattenPartialActivities(day.activities)
            .map((raw, idx) => {
              const act = raw as {
                title?: string;
                name?: string;
                time?: string;
                start_time?: string;
                arrivalTime?: string;
                departureTime?: string;
                description?: string;
                category?: string;
                timeSlot?: string;
                time_slot?: string;
                estimatedCostEur?: number;
                estimated_cost_eur?: number;
                cost_eur?: number;
                transport_type?: TripPlanResponse["itinerar"][number]["days"][number]["activities"][number]["transport_type"];
                duration?: string;
                coordinates?: { lat?: number; lng?: number };
                lat?: number;
                lng?: number;
                tripAdvisorStyleDetails?: TripPlanResponse["itinerar"][number]["days"][number]["activities"][number]["tripAdvisorStyleDetails"];
                unsplashQuery?: string;
                imageUrl?: string;
              };
              const description = act.description?.trim() || "";
              const title = (act.title?.trim() || act.name?.trim() || "");
              if (!title) return null;
              const slots = ["dopoldan", "popoldan", "vecer"] as const;
              const clock =
                parseHmClock(act.arrivalTime) ??
                parseHmClock(act.start_time) ??
                parseHmClock(act.time);
              const cost =
                typeof act.estimatedCostEur === "number"
                  ? act.estimatedCostEur
                  : typeof act.estimated_cost_eur === "number"
                    ? act.estimated_cost_eur
                    : typeof act.cost_eur === "number"
                      ? act.cost_eur
                      : undefined;
              const mappedSlot = normalizeTimeSlotLabel(act.timeSlot ?? act.time_slot ?? "");
              return {
                time: clock ?? "",
                title,
                description: description || title,
                category: isMapCategory(act.category) ? act.category : "sightseeing",
                timeSlot:
                  mappedSlot ??
                  (act.timeSlot === "dopoldan" ||
                  act.timeSlot === "popoldan" ||
                  act.timeSlot === "vecer"
                    ? act.timeSlot
                    : slots[idx % slots.length]!),
                arrivalTime: clock,
                departureTime: parseHmClock(act.departureTime),
                estimatedCostEur: cost,
                transport_type: act.transport_type,
                duration: act.duration?.trim(),
                coordinates:
                  act.coordinates?.lat != null && act.coordinates?.lng != null
                    ? { lat: act.coordinates.lat, lng: act.coordinates.lng }
                    : act.lat != null && act.lng != null
                      ? { lat: act.lat, lng: act.lng }
                      : undefined,
                tripAdvisorStyleDetails: act.tripAdvisorStyleDetails,
                unsplashQuery: act.unsplashQuery?.trim(),
                imageUrl: act.imageUrl,
              };
            })
            .filter(Boolean) as TripPlanResponse["itinerar"][number]["days"][number]["activities"];

          const transportation =
            (Array.isArray(day.transportation) && day.transportation.length > 0
              ? day.transportation
              : transferToTransportation(day.transfer)) ?? undefined;

          return {
            day_number: day.day_number,
            date: day.date?.trim() || "",
            day_name: day.day_name?.trim() || dayTitle,
            title: dayTitle,
            city: typeof day.city === "string" ? day.city.trim() : undefined,
            dailyBudget:
              typeof day.dailyBudget === "number"
                ? day.dailyBudget
                : typeof (day as { daily_budget_per_person_eur?: number }).daily_budget_per_person_eur ===
                    "number"
                  ? (day as { daily_budget_per_person_eur?: number }).daily_budget_per_person_eur!
                  : 0,
            drivingDistanceKm:
              typeof day.drivingDistanceKm === "number" ? day.drivingDistanceKm : 0,
            drivingDurationHours: day.drivingDurationHours?.trim() || "0h",
            travelHack: day.travelHack?.trim(),
            transportTip:
              day.transportTip?.trim() ||
              (day as { transport_tip?: string }).transport_tip?.trim(),
            local_tips: day.local_tips?.trim(),
            transportation,
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
      return_flight_eu: partial.trip_metadata?.return_flight_eu as
        | TripPlanResponse["trip_metadata"]["return_flight_eu"]
        | undefined,
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
    hotels: (partial.hotels ?? []).filter(Boolean) as TripPlanResponse["hotels"],
    travel_requirements: partial.travel_requirements as TripPlanResponse["travel_requirements"],
  };
}

/** Map streaming partial Gemini JSON → preview `AiTripPlan` (text only, no images). */
export function partialTripPlanToPreviewPlan(
  partial: PartialResponse & { days?: unknown[]; trip_title?: string },
  opts: GeminiPlanMapOpts & { enrich?: boolean },
): AiTripPlan | null {
  if (resolveTripStyle(opts) === "single_base" || isSingleBasePayload(partial)) {
    return singleBaseJsonToPlan(partial, opts);
  }
  const coerced = coercePartialResponse(partial);
  if (!coerced) return null;
  try {
    const plan = tripPlanResponseToAiTripPlan(coerced, opts);
    return plan;
  } catch (err) {
    console.warn("[geminiStreamMap] preview mapping failed:", err);
    return null;
  }
}
