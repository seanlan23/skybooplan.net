/** Official itinerary generation style — API + Gemini contract. */

import {
  DEFAULT_TRAVEL_STYLE,
  isTravelStyle,
  type TravelStyle,
} from "@/lib/travelStyle";

export const TRIP_STYLES = ["single_base", "explorer", "roadtrip"] as const;

export type TripStyle = (typeof TRIP_STYLES)[number];

/** If `tripStyle` is omitted on the request body, generation uses one resort base. */
export const DEFAULT_TRIP_STYLE: TripStyle = "single_base";

const TRAVEL_TO_TRIP: Record<TravelStyle, TripStyle> = {
  resort: "single_base",
  explore: "explorer",
  roadtrip: "roadtrip",
};

const TRIP_TO_TRAVEL: Record<TripStyle, TravelStyle> = {
  single_base: "resort",
  explorer: "explore",
  roadtrip: "roadtrip",
};

export function isTripStyle(value: unknown): value is TripStyle {
  return value === "single_base" || value === "explorer" || value === "roadtrip";
}

export function travelStyleToTripStyle(style: TravelStyle): TripStyle {
  return TRAVEL_TO_TRIP[style];
}

export function tripStyleToTravelStyle(style: TripStyle): TravelStyle {
  return TRIP_TO_TRAVEL[style];
}

function normalizeTripStyleLoose(value: unknown): TripStyle | undefined {
  if (isTripStyle(value)) return value;
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!raw) return undefined;
  if (raw === "single_base" || raw === "singlebase" || raw === "resort") return "single_base";
  if (raw === "explorer" || raw === "explore") return "explorer";
  if (raw === "roadtrip" || raw === "road_trip") return "roadtrip";
  return undefined;
}

export type TripStyleSource = {
  tripStyle?: unknown;
  travelStyle?: unknown;
  groundTransportMode?: string | null;
};

/**
 * Resolve the official generation style.
 * Prefers `tripStyle`, then UI `travelStyle`. Missing → `single_base`,
 * except car/motorhome trips default to `roadtrip` (a one-base resort JSON
 * cannot describe a driving loop).
 */
export function resolveTripStyle(input: TripStyleSource): TripStyle {
  const fromTrip = normalizeTripStyleLoose(input.tripStyle);
  if (fromTrip) return fromTrip;
  if (isTravelStyle(input.travelStyle)) return travelStyleToTripStyle(input.travelStyle);
  const fromTravel = normalizeTripStyleLoose(input.travelStyle);
  if (fromTravel) return fromTravel;
  const ground = String(input.groundTransportMode ?? "").trim().toLowerCase();
  if (ground === "car" || ground === "motorhome") return "roadtrip";
  return DEFAULT_TRIP_STYLE;
}

export function isSingleBaseTripStyle(style: TripStyle): boolean {
  return style === "single_base";
}

/** Finished or streaming resort plan — no hourly day itinerary. */
export function isSingleBasePlan(plan: {
  tripStyle?: unknown;
  resortStay?: unknown;
} | null | undefined): boolean {
  if (!plan) return false;
  return plan.tripStyle === "single_base" || Boolean(plan.resortStay);
}

export function isDayByDayTripStyle(style: TripStyle): boolean {
  return style === "explorer" || style === "roadtrip";
}

/** Keep UI chips (`resort` | `explore` | `roadtrip`) in sync with the API id. */
export function resolveTravelStyleFromTripInput(input: TripStyleSource): TravelStyle {
  if (isTravelStyle(input.travelStyle)) return input.travelStyle;
  return tripStyleToTravelStyle(resolveTripStyle(input)) ?? DEFAULT_TRAVEL_STYLE;
}
