import { z } from "zod";
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
  description: z.string(),
  category: z.enum(MAP_POI_CATEGORIES),
  /** Day part — dopoldan | popoldan | vecer (required). */
  timeSlot: z.enum(DAY_TIME_SLOTS),
  /** Realistic visit window — e.g. "09:00". */
  arrivalTime: z.string().min(1),
  /** Realistic visit end — e.g. "11:30". */
  departureTime: z.string().min(1),
  /** Estimated cost for this activity in EUR. */
  estimatedCostEur: z.number().min(0).optional(),
  coordinates: coordinatesSchema.optional(),
  /** English Unsplash search term for this activity (omit for hotel/airport). */
  unsplashQuery: z.string().min(1).optional(),
  /** Required for sightseeing activities — omit for hotel/airport only. */
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
  /** Day-specific transport tip — ONLY if genuinely useful (e.g. wind warning). Omit if none. */
  transportTip: z.string().optional(),
  /** Internal flights, ferries, trains for this day — shown as premium transport cards. */
  transportation: z.array(transportLegSchema).optional(),
  activities: z.array(activitySchema),
});

/** Client-safe shared types/constants — no @ai-sdk imports. */
export const tripPlanSchema = z.object({
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
      pois: z.array(poiSchema).min(1),
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
