import { z } from "zod";
import { coerceActivityDescriptionFields } from "@/lib/activityDescription";
import { GEMINI_TIME_SLOTS } from "@/lib/itineraryDayContract";
import { liftFlatItineraryToItinerar } from "@/lib/itineraryJsonSchema";
import { MAP_POI_CATEGORIES } from "@/lib/mapPoiCategory";

export type { ActivityItem, ItineraryDayPlan, TimeSlot } from "@/lib/itineraryDayContract";
export { GEMINI_TIME_SLOTS } from "@/lib/itineraryDayContract";

export { MAP_POI_CATEGORIES, type MapPoiCategory } from "@/lib/mapPoiCategory";

const wgsLat = z.number().min(-90).max(90);
const wgsLng = z.number().min(-180).max(180);

const coordinatesSchema = z.object({
  lat: wgsLat,
  lng: wgsLng,
});

/** Rich guide content for TripAdvisor-style POI modal. */
export const tripAdvisorStyleDetailsSchema = z.object({
  highlights: z.array(z.string().min(4)).min(2).max(6),
  proTip: z.string().min(12),
  bestTimeOfDay: z.string().min(3),
  rating: z.number().min(3).max(5),
  reviewSummary: z.string().min(20),
});

export type TripAdvisorStyleDetails = z.infer<typeof tripAdvisorStyleDetailsSchema>;

const poiSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  lat: wgsLat,
  lng: wgsLng,
  /** Clean English Unsplash search term, e.g. "Burj Khalifa" not "Burj Kalifa". */
  unsplashQuery: z.string().min(1),
  tripAdvisorStyleDetails: tripAdvisorStyleDetailsSchema.optional(),
});

const DAY_TIME_SLOTS = ["dopoldan", "popoldan", "vecer"] as const;

export const ACTIVITY_TRANSPORT_TYPES = [
  "flight",
  "ferry",
  "train",
  "van",
  "bus",
  "taxi",
] as const;

const transportLegSchema = z.object({
  type: z.enum(["flight", "ferry", "train", "van"]),
  from: z.string().min(1),
  to: z.string().min(1),
  duration: z.string().min(1).optional(),
  estimatedPrice: z.number().min(0),
});

const activitySchema = z.object({
  time: z.string(),
  title: z.string(),
  /**
   * Short copy for the activity. Prefer bullets[] — coerce syncs description from bullets
   * (or splits a wall-of-text description into newline bullets).
   */
  description: z.string(),
  /**
   * Preferred structured body: 2–4 short lines. Coerce fills this from description when omitted.
   */
  bullets: z.array(z.string().min(1).max(200)).max(4).optional(),
  category: z.enum(MAP_POI_CATEGORIES),
  /** Day part — dopoldan | popoldan | vecer (required). */
  timeSlot: z.enum(DAY_TIME_SLOTS),
  /**
   * Optional visit window. Omit on arrival/departure flight days — app injects
   * boarding-pass logistics clocks. Prefer empty for sightseeing too.
   */
  arrivalTime: z.string().optional(),
  /** Optional visit end — same rules as arrivalTime. */
  departureTime: z.string().optional(),
  /** Estimated cost for this activity in EUR. */
  estimatedCostEur: z.number().min(0).optional(),
  /**
   * Preferred on movement activities. Missing values are filled by coerceTripPlanPayload.
   */
  transport_type: z.enum(ACTIVITY_TRANSPORT_TYPES).optional(),
  /** Exact travel duration label — e.g. "1h 10min", "45min". */
  duration: z.string().min(1).optional(),
  coordinates: coordinatesSchema.optional(),
  /** English Unsplash search term for this activity (omit for hotel/airport). */
  unsplashQuery: z.string().min(1).optional(),
  /** Preferred for sightseeing — omit for hotel/airport only. */
  tripAdvisorStyleDetails: tripAdvisorStyleDetailsSchema.optional(),
});

const transferSchema = z.object({
  type: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  duration: z.string().min(1).optional(),
  cost_eur: z.number().min(0).optional(),
});

const daySchema = z.object({
  day_number: z.number().int().min(1),
  date: z.string(),
  day_name: z.string(),
  title: z.string(),
  /** Booking.com / map city for this calendar day when it differs from the phase. */
  city: z.string().min(1).optional(),
  /** Optional hop — coerce copies this into transportation[] when missing. */
  transfer: transferSchema.optional(),
  daily_budget_per_person_eur: z.number().min(0).optional(),
  /** Daily spend estimate in EUR (fuel, food, camping fees). */
  dailyBudget: z.number().min(0),
  /** Driving distance for this day in km. */
  drivingDistanceKm: z.number().min(0),
  /** Driving duration label e.g. "3h 45m". */
  drivingDurationHours: z.string().min(1),
  /** Unique, location-specific insider tip for this day — never repeat across days. */
  travelHack: z.string().min(15).optional(),
  /** Daily transport guide: apps, A→B tips, ferries for this day. */
  transportTip: z.string().min(20).optional(),
  /** Local tips & safety for this day's city (water, food, scams, etiquette). */
  local_tips: z.string().optional(),
  /** Internal flights, ferries, trains for this day — shown as premium transport cards. */
  transportation: z.array(transportLegSchema).optional(),
  activities: z.array(activitySchema),
});

/** Structured weather widget for the itinerary header (season, temp, clothing). */
export const weatherWidgetSchema = z.object({
  season: z.string().min(3),
  avgTemp: z.string().min(2),
  clothing: z.string().min(3),
});

export type WeatherWidget = z.infer<typeof weatherWidgetSchema>;

/** @deprecated Legacy shape — mapped to weatherWidget in geminiPlanMap. */
export const weatherSummarySchema = z.object({
  currentCondition: z.string().min(3),
  avgTemperature: z.string().min(2),
  seasonType: z.string().min(3),
  clothingAdvice: z.string().min(3),
});

export type WeatherSummary = z.infer<typeof weatherSummarySchema>;

/** Critical destination safety alert — null when no acute internal risk. */
export const safetyWarningSchema = z.object({
  title: z.string().min(3).optional(),
  message: z.string().min(20),
});

export type SafetyWarningPayload = z.infer<typeof safetyWarningSchema>;

/** Client-safe shared types/constants — no @ai-sdk imports. */
export const tripPlanSchema = z.object({
  /** Red critical alert card when destination has war, unrest, collapse, etc. Otherwise null. */
  safetyWarning: safetyWarningSchema.nullable().optional(),
  /** Weather + season + clothing widget below safety (or below planner settings). */
  weatherWidget: weatherWidgetSchema.optional(),
  /** @deprecated Prefer weatherWidget — kept for backward compatibility. */
  weatherSummary: weatherSummarySchema.optional(),
  trip_metadata: z.object({
    destination: z.string(),
    season_warning: z.string(),
    currency: z.string(),
    visa_required: z.boolean(),
    /** Return flight to Europe — populated on logistics/last day. */
    return_flight_eu: z
      .object({
        departure_time: z.string().min(1),
        arrival_time_eu: z.string().min(1),
        from_airport: z.string().min(1),
        to_airport: z.string().min(1),
        summary: z.string().min(1),
      })
      .optional(),
  }),
  travel_requirements: z
    .object({
      target_residents: z.array(z.string().min(1)).min(1),
      visa_info: z
        .array(
          z.object({
            country: z.string().min(1),
            requirement: z.string().min(1),
            how_to_apply: z.string().min(1),
          }),
        )
        .min(1),
      vaccinations: z.string().min(1),
      estimated_costs: z.string().min(1),
    })
    .optional(),
  itinerar: z.array(
    z.object({
      /** Slovenian display label for the phase (UI). */
      phase: z.string().min(1),
      /** Official English city name for Booking.com + map (e.g. "Bangkok", "Chiang Mai"). */
      city: z.string().min(1),
      /** English Unsplash search term for city hero photo, e.g. "Dubai" not "Dubaj". */
      unsplashQuery: z.string().min(1),
      lat: wgsLat,
      lng: wgsLng,
      /** Must-see sights for this stop with exact coordinates. */
      pois: z.array(poiSchema).default([]),
      days: z.array(daySchema),
    }),
  ),
  logistics_and_tips: z.object({
    transport: z.object({
      flights: z.string(),
      ferries: z.string(),
      city_transport: z.string(),
    }),
    finance: z.string(),
    internet: z.string(),
  }),
  trip_title: z.string().optional(),
  overview: z.string().optional(),
  total_budget_eur: z.number().min(0).optional(),
  accommodations: z
    .array(
      z.object({
        city: z.string().min(1),
        nights: z.number().int().min(0),
        from_date: z.string().optional(),
        to_date: z.string().optional(),
      }),
    )
    .optional(),
  /** Hotel suggestions — MUST be empty [] when user travels by motorhome/RV. */
  hotels: z
    .array(
      z.object({
        name: z.string(),
        city: z.string().optional(),
        nights: z.number().min(0).optional(),
        from_date: z.string().optional(),
        to_date: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
});

/** Slim structured-output schema — matches `ActivityItem` / `ItineraryDayPlan`. */
const geminiDayActivitySchema = z.object({
  time_slot: z.enum(GEMINI_TIME_SLOTS),
  start_time: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  estimated_cost_eur: z.number().min(0).optional(),
  navigation_available: z.boolean().optional(),
});

const geminiDaySchema = z.object({
  day_number: z.number().int().min(1),
  date: z.string().min(1),
  city: z.string().min(1),
  day_title: z.string().min(1),
  daily_budget_per_person_eur: z.number().min(1),
  activities: z.array(geminiDayActivitySchema).min(1),
  local_tips: z.string().min(1),
  transport_tip: z.string().min(1),
});

export const tripPlanGeminiSchema = z.object({
  days: z.array(geminiDaySchema).min(1),
  trip_title: z.string().min(1).optional(),
  overview: z.string().optional(),
  total_budget_eur: z.number().min(0).optional(),
  accommodations: z
    .array(
      z.object({
        city: z.string().min(1),
        nights: z.number().int().min(0),
        from_date: z.string().optional(),
        to_date: z.string().optional(),
      }),
    )
    .optional(),
  trip_metadata: z
    .object({
      destination: z.string(),
      season_warning: z.string().optional(),
      currency: z.string().optional(),
      visa_required: z.boolean().optional(),
    })
    .optional(),
  weatherWidget: weatherWidgetSchema.optional(),
  safetyWarning: safetyWarningSchema.nullable().optional(),
  hotels: z
    .array(
      z.object({
        name: z.string().optional(),
        city: z.string().min(1),
        nights: z.number().min(0).optional(),
        from_date: z.string().optional(),
        to_date: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .optional(),
});

export type TripPlanResponse = z.infer<typeof tripPlanSchema>;

export type TripPlanPax = {
  adults: number;
  childrenAges: number[];
};

export type TripBudgetTier = "budget" | "standard" | "premium";

/** One Gemini streamObject call — long trips are split so JSON is not truncated. */
export type TripPlanDayRange = {
  start: number;
  end: number;
  visitedCities?: string[];
  lastCity?: string;
  /** Phase-1 bases locked after the first stream batch. */
  lockedRoute?: string;
};

export function thisResponseDaySpan(
  params: Pick<{ days: number; dayRange?: TripPlanDayRange }, "days" | "dayRange">,
): {
  start: number;
  end: number;
  count: number;
  total: number;
  isPartial: boolean;
  includesArrival: boolean;
  includesDeparture: boolean;
} {
  const total = Math.max(1, params.days);
  const start = Math.max(1, params.dayRange?.start ?? 1);
  const end = Math.min(total, Math.max(start, params.dayRange?.end ?? total));
  return {
    start,
    end,
    count: end - start + 1,
    total,
    isPartial: start > 1 || end < total,
    includesArrival: start === 1,
    includesDeparture: end >= total,
  };
}

export type GenerateTripPlanParams = {
  originIata: string;
  destinationIata: string;
  returnFromIata?: string;
  departDate: string;
  returnDate?: string;
  destination: string;
  days: number;
  /** When set, Gemini must emit only this day_number window (stream continuation). */
  dayRange?: TripPlanDayRange;
  month: string;
  pax: TripPlanPax;
  budget: TripBudgetTier;
  wishTags: string[];
  customWishes?: string;
  pace?: "intensive" | "relaxed" | "calm";
  priorities?: string[];
  /** Ground transport from home city to destination */
  groundTransportMode?: "car" | "motorhome" | "train";
  originPlace?: string;
  destinationPlace?: string;
  /** UI locale for output language (e.g. sl, en, de). */
  language?: string;
  /** Display currency for all plan costs (EUR or USD). */
  currency?: "EUR" | "USD";
  /** Optional user-uploaded image for Gemini Vision. */
  sharedImage?: {
    mimeType: string;
    base64: string;
  };
  /** Selected boarding-pass local times from the flight card (hero → AI plan). */
  flightContext?: {
    outboundDepart: string;
    outboundArrive: string;
    outboundArriveDayOffset: number;
    inboundDepart?: string;
    inboundArrive?: string;
    outboundStops?: number;
    inboundStops?: number;
    outboundVia?: string;
    inboundVia?: string;
  };
};

export const TRIP_WISH_TAGS = [
  "Vegetarijansko/Vegansko",
  "Dostopno z vozičkom",
  "Najem avtomobila",
  "Brez nočnih voženj",
] as const;

export type TripWishTag = (typeof TRIP_WISH_TAGS)[number];

export function normalizeIata(code: string | undefined | null): string | null {
  const v = (code ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : null;
}

export function normalizeTripPlanPax(
  pax: Partial<TripPlanPax> | undefined,
  fallbackTotal = 1,
): TripPlanPax {
  const childrenAges = Array.isArray(pax?.childrenAges)
    ? pax!.childrenAges.filter((a) => typeof a === "number" && a >= 0 && a <= 17)
    : [];
  const adultsRaw = pax?.adults ?? Math.max(1, fallbackTotal - childrenAges.length);
  const adults = Math.min(9, Math.max(1, Math.floor(adultsRaw)));
  return { adults, childrenAges };
}

export function isTripPlanResponse(value: unknown): value is TripPlanResponse {
  return tripPlanSchema.safeParse(value).success;
}

function isTransportishTitle(title: string, category?: string): boolean {
  return (
    category === "airport" ||
    /let|flight|trajekt|ferry|vlak|train|speedboat|kombi|van\b|bus\b|taxi|grab|prevoz/i.test(
      title,
    )
  );
}

function inferTransportType(
  title: string,
  category?: string,
): (typeof ACTIVITY_TRANSPORT_TYPES)[number] {
  const t = `${category ?? ""} ${title}`.toLowerCase();
  if (category === "airport" || /let|flight|plane|letališč/.test(t)) return "flight";
  if (/trajekt|ferry|boat|speedboat|ladj/.test(t)) return "ferry";
  if (/vlak|train/.test(t)) return "train";
  if (/kombi|van\b/.test(t)) return "van";
  if (/bus|avtobus/.test(t)) return "bus";
  return "taxi";
}

function parseHmMinutes(hm: string): number | null {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function inferDurationLabel(arrivalTime?: string, departureTime?: string): string {
  const a = arrivalTime ? parseHmMinutes(arrivalTime) : null;
  const b = departureTime ? parseHmMinutes(departureTime) : null;
  if (a != null && b != null) {
    let diff = b - a;
    if (diff <= 0) diff += 24 * 60;
    if (diff >= 60) {
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return m ? `${h}h ${m}min` : `${h}h`;
    }
    if (diff > 0) return `${diff}min`;
  }
  return "";
}

/** Lift/flatten Gemini JSON so schema parse succeeds. Does not invent days or POIs. */
export function coerceTripPlanPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const plan = liftFlatItineraryToItinerar(structuredClone(raw)) as Record<string, unknown>;
  const itinerar = plan.itinerar;
  if (!Array.isArray(itinerar)) return plan;

  for (const phase of itinerar) {
    if (!phase || typeof phase !== "object") continue;
    const p = phase as Record<string, unknown>;
    const city = typeof p.city === "string" && p.city.trim() ? p.city.trim() : "City";
    if (typeof p.phase !== "string" || !p.phase.trim()) p.phase = city;
    if (typeof p.unsplashQuery !== "string" || !p.unsplashQuery.trim()) p.unsplashQuery = city;
    const lat = typeof p.lat === "number" ? p.lat : 0;
    const lng = typeof p.lng === "number" ? p.lng : 0;
    p.lat = lat;
    p.lng = lng;
    const days = Array.isArray(p.days) ? p.days : [];

    for (const day of days) {
      if (!day || typeof day !== "object") continue;
      const d = day as Record<string, unknown>;
      const activities = Array.isArray(d.activities) ? d.activities : [];

      for (const act of activities) {
        if (!act || typeof act !== "object") continue;
        const a = act as Record<string, unknown>;
        // All days: description becomes 2–4 short bullets (no Katoomba-style wall of text).
        coerceActivityDescriptionFields(a);
        const title = typeof a.title === "string" ? a.title : "";
        const category = typeof a.category === "string" ? a.category : undefined;
        if (!isTransportishTitle(title, category)) continue;
        if (!a.transport_type) a.transport_type = inferTransportType(title, category);
        if (typeof a.duration !== "string" || !a.duration.trim()) {
          const inferred = inferDurationLabel(
            typeof a.arrivalTime === "string" ? a.arrivalTime : undefined,
            typeof a.departureTime === "string" ? a.departureTime : undefined,
          );
          if (inferred) a.duration = inferred;
          else delete a.duration;
        }
      }
    }

    if (!Array.isArray(p.pois)) p.pois = [];
  }

  if (!Array.isArray(plan.hotels)) plan.hotels = [];
  if (Array.isArray(plan.hotels)) {
    for (const row of plan.hotels) {
      if (!row || typeof row !== "object") continue;
      const h = row as Record<string, unknown>;
      const city = typeof h.city === "string" ? h.city.trim() : "";
      const name = typeof h.name === "string" ? h.name.trim() : "";
      if (!name && city) h.name = city;
      if (!city && name) h.city = name;
    }
  }
  if (!plan.logistics_and_tips || typeof plan.logistics_and_tips !== "object") {
    plan.logistics_and_tips = {
      transport: { flights: "", ferries: "", city_transport: "" },
      finance: "",
      internet: "",
    };
  }
  return plan;
}

/** Parse + coerce Gemini output into a valid trip plan (or null). */
export function parseCoercedTripPlan(raw: unknown): {
  success: true;
  data: TripPlanResponse;
} | {
  success: false;
  error: z.ZodError;
} {
  const coerced = coerceTripPlanPayload(raw);
  const parsed = tripPlanSchema.safeParse(coerced);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, error: parsed.error };
}
