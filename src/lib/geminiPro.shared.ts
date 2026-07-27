import { z } from "zod";
import { coerceActivityDescriptionFields } from "@/lib/activityDescription";
import { MAP_POI_CATEGORIES } from "@/lib/mapPoiCategory";

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
  tripAdvisorStyleDetails: tripAdvisorStyleDetailsSchema,
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
  duration: z.string().min(1),
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

const daySchema = z.object({
  day_number: z.number().int().min(1),
  date: z.string(),
  day_name: z.string(),
  title: z.string(),
  /** Daily spend estimate in EUR (fuel, food, camping fees). */
  dailyBudget: z.number().min(0),
  /** Driving distance for this day in km. */
  drivingDistanceKm: z.number().min(0),
  /** Driving duration label e.g. "3h 45m". */
  drivingDurationHours: z.string().min(1),
  /** Unique, location-specific insider tip for this day — never repeat across days. */
  travelHack: z.string().min(15).optional(),
  /** Daily transport guide: apps, A→B tips, ferries, local warnings for this day. */
  transportTip: z.string().min(20).optional(),
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
  /** Hotel suggestions — MUST be empty [] when user travels by motorhome/RV. */
  hotels: z
    .array(
      z.object({
        name: z.string(),
        city: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .default([]),
});

export type TripPlanResponse = z.infer<typeof tripPlanSchema>;

export type TripPlanPax = {
  adults: number;
  childrenAges: number[];
};

export type TripBudgetTier = "budget" | "standard" | "premium";

export type GenerateTripPlanParams = {
  originIata: string;
  destinationIata: string;
  returnFromIata?: string;
  departDate: string;
  returnDate?: string;
  destination: string;
  days: number;
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
  return "1h";
}

function defaultTripAdvisorDetails(name: string) {
  return {
    highlights: [`${name}`, "Local atmosphere"],
    proTip: "Go early to avoid crowds and heat.",
    bestTimeOfDay: "Morning",
    rating: 4.5,
    reviewSummary:
      "Visitors enjoy this stop for its character, photos, and nearby food options.",
  };
}

/**
 * Repair common Gemini omissions so schema validation succeeds.
 * Missing transport_type/duration and empty phase pois[] are the top failure modes.
 */
export function coerceTripPlanPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const plan = structuredClone(raw) as Record<string, unknown>;
  const itinerar = plan.itinerar;
  if (!Array.isArray(itinerar)) return plan;

  for (const phase of itinerar) {
    if (!phase || typeof phase !== "object") continue;
    const p = phase as Record<string, unknown>;
    const city = typeof p.city === "string" && p.city.trim() ? p.city.trim() : "City";
    const lat = typeof p.lat === "number" ? p.lat : 0;
    const lng = typeof p.lng === "number" ? p.lng : 0;
    const days = Array.isArray(p.days) ? p.days : [];

    for (const day of days) {
      if (!day || typeof day !== "object") continue;
      const d = day as Record<string, unknown>;
      const activities = Array.isArray(d.activities) ? d.activities : [];
      let hasTransport = false;

      for (const act of activities) {
        if (!act || typeof act !== "object") continue;
        const a = act as Record<string, unknown>;
        // All days: description becomes 2–4 short bullets (no Katoomba-style wall of text).
        coerceActivityDescriptionFields(a);
        const title = typeof a.title === "string" ? a.title : "";
        const category = typeof a.category === "string" ? a.category : undefined;
        if (!isTransportishTitle(title, category)) continue;
        hasTransport = true;
        if (!a.transport_type) a.transport_type = inferTransportType(title, category);
        if (typeof a.duration !== "string" || !a.duration.trim()) {
          a.duration = inferDurationLabel(
            typeof a.arrivalTime === "string" ? a.arrivalTime : undefined,
            typeof a.departureTime === "string" ? a.departureTime : undefined,
          );
        }
      }

      if (hasTransport && (!Array.isArray(d.transportation) || d.transportation.length === 0)) {
        d.transportation = activities
          .filter((act) => {
            if (!act || typeof act !== "object") return false;
            const a = act as Record<string, unknown>;
            const title = typeof a.title === "string" ? a.title : "";
            const category = typeof a.category === "string" ? a.category : undefined;
            return isTransportishTitle(title, category);
          })
          .map((act) => {
            const a = act as Record<string, unknown>;
            const title = String(a.title ?? "Transfer");
            const arrow = title.split(/\s*[→\-–]\s*/);
            const type = (a.transport_type as string) || inferTransportType(title, String(a.category ?? ""));
            const legType =
              type === "bus" || type === "taxi"
                ? "van"
                : type === "car" || type === "drive" || type === "driving" || type === "auto"
                  ? "car"
                  : type === "flight" || type === "ferry" || type === "train" || type === "van"
                    ? type
                    : "van";
            return {
              type: legType,
              from: arrow[0]?.trim() || city,
              to: arrow[1]?.trim() || city,
              duration: String(a.duration ?? "1h"),
              estimatedPrice: typeof a.estimatedCostEur === "number" ? a.estimatedCostEur : 0,
            };
          });
      }
    }

    const pois = Array.isArray(p.pois) ? p.pois : [];
    if (pois.length === 0) {
      const fromActivity = days
        .flatMap((day) => {
          if (!day || typeof day !== "object") return [];
          const acts = (day as { activities?: unknown[] }).activities;
          return Array.isArray(acts) ? acts : [];
        })
        .find((act) => {
          if (!act || typeof act !== "object") return false;
          const a = act as Record<string, unknown>;
          const title = String(a.title ?? "");
          return (
            a.category === "sightseeing" ||
            (a.coordinates && !isTransportishTitle(title, String(a.category ?? "")))
          );
        }) as Record<string, unknown> | undefined;

      const coords = (fromActivity?.coordinates as { lat?: number; lng?: number } | undefined) ?? {};
      const name =
        (typeof fromActivity?.title === "string" && fromActivity.title.trim()) || city;
      p.pois = [
        {
          name,
          description:
            (typeof fromActivity?.description === "string" && fromActivity.description) ||
            `Key stop in ${city}.`,
          lat: typeof coords.lat === "number" ? coords.lat : lat,
          lng: typeof coords.lng === "number" ? coords.lng : lng,
          unsplashQuery: name,
          tripAdvisorStyleDetails: defaultTripAdvisorDetails(name),
        },
      ];
    }
  }

  if (!Array.isArray(plan.hotels)) plan.hotels = [];
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
