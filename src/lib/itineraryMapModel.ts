/**
 * Single source of truth for the itinerary map.
 * One day → one city center → few pins → optional inbound leg.
 * Map renderer must not re-resolve coordinates.
 */
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { haversineKm } from "@/lib/geoMath";
import {
  normalizeMapPoiCategory,
  type MapPoiCategory,
} from "@/lib/mapPoiCategory";
import { lookupRegionCoords } from "@/lib/regionCoords";

export const MAX_DAY_PINS = 4;
export const MAX_PIN_FROM_CENTER_KM = 55;
export const COLOCATE_KM = 1.2;
export const DAY_VIEW_ZOOM = 11.2;
export const PLAY_VIEW_ZOOM = 11.2;
/** Beyond this, easeTo at city zoom paints a black void mid-ocean — use flyTo. */
export const LONG_HAUL_CAMERA_KM = 800;
export const CAMERA_MS_LOCAL = 2800;
export const MIN_ROUTE_DRAW_KM = 40;
const AIRPORT_SNAP_KM = 12;

/** Duration for a camera move — long hauls are slow and use flyTo (zoom-out arc). */
export function cameraMoveDurationMs(distKm: number): number {
  if (!Number.isFinite(distKm) || distKm < LONG_HAUL_CAMERA_KM) return CAMERA_MS_LOCAL;
  return Math.min(9000, Math.max(5000, Math.round(distKm * 0.4)));
}

export function isLongHaulCameraMove(distKm: number): boolean {
  return Number.isFinite(distKm) && distKm >= LONG_HAUL_CAMERA_KM;
}

export type LngLat = { lat: number; lng: number };

export type MapDayPin = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: MapPoiCategory;
  description?: string;
  arrivalTime?: string;
  departureTime?: string;
  estimatedCostEur?: number;
  imageUrl?: string;
};

export type MapDayLeg = {
  mode: "flight" | "ferry" | "drive";
  from: LngLat;
  to: LngLat;
};

/** Pure day model consumed by the Mapbox renderer. */
export type MapDay = {
  day: number;
  cityLabel: string;
  center: LngLat;
  pins: MapDayPin[];
  legIn?: MapDayLeg;
};

export function isValidMapCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return true;
}

function normalizeCityLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^dan\s+\d+\s*[:\-–]\s*/i, "")
    .replace(/^day\s+\d+\s*[:\-–]\s*/i, "")
    .replace(/^prihod v\s+/i, "")
    .replace(/^arrival in\s+/i, "")
    .trim();
}

/** Real relocation / flight day — not every day that mentions check-in. */
export function isTravelDay(day: DayPlan): boolean {
  if (day.inFlightDay) return true;
  if ((day.transportation ?? []).some((t) => t.type === "flight" || t.type === "ferry")) {
    return true;
  }
  const title = `${day.title} ${day.city ?? ""}`;
  return /odhod|departure|prihod.*let|arrival.*flight|mednarodni let|notranji let|in-?flight|trajekt|ferry day/i.test(
    title,
  );
}

function nearestAirportHub(coord: LngLat): { code: string; km: number } | null {
  let best: { code: string; km: number } | null = null;
  for (const [code, meta] of Object.entries(DESTINATION_BY_IATA)) {
    const km = haversineKm([coord.lng, coord.lat], [meta.lng, meta.lat]);
    if (km > AIRPORT_SNAP_KM) continue;
    if (!best || km < best.km) best = { code, km };
  }
  return best;
}

export function isAirportRunwayCoord(coord: LngLat): boolean {
  return nearestAirportHub(coord) != null;
}

/**
 * City centroid only. IATA hubs never win via city name.
 * Prefer curated city table; reject runway AI coords on sightseeing days.
 */
export function resolveCityCenter(day: DayPlan): LngLat | null {
  const city = normalizeCityLabel(day.city);
  const focus = normalizeCityLabel(day.focusName);
  const travel = isTravelDay(day);

  const cityKnown =
    (city ? lookupRegionCoords(city) : null) ??
    (focus ? lookupRegionCoords(focus) : null);

  const ai = isValidMapCoord(day.lat, day.lng)
    ? ({ lat: day.lat, lng: day.lng } as const)
    : null;

  if (cityKnown) {
    if (ai && !travel && isAirportRunwayCoord(ai)) return cityKnown;
    if (ai && travel) {
      // Travel day may sit on a hub; still prefer city label when known.
      return cityKnown;
    }
    return cityKnown;
  }

  if (ai && (travel || !isAirportRunwayCoord(ai))) return ai;
  return null;
}

function isLogisticsName(name: string): boolean {
  return /^(odhod|departure|prihod|arrival|check-?in|prevoz|transfer|letališč|airport|mednarodni let|notranji let)\b/i.test(
    name.trim(),
  );
}

function fuzzyNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9čšžćđäöüáéíóú\s]/gi, "")
    .replace(/\b(the|a|an|hotel|temple|wat|plaža|beach|national|garden)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
}

function activityImageByName(day: DayPlan, name: string): string | undefined {
  const key = fuzzyNameKey(name);
  if (key.length < 4) return undefined;
  const slots = day.activities;
  if (!slots) return undefined;
  for (const act of [...(slots.morning ?? []), ...(slots.afternoon ?? []), ...(slots.evening ?? [])]) {
    if (!act.imageUrl?.trim()) continue;
    if (fuzzyNameKey(act.name) === key) return act.imageUrl;
  }
  return undefined;
}

function collectPins(day: DayPlan, center: LngLat): MapDayPin[] {
  const travel = isTravelDay(day);
  const city = normalizeCityLabel(day.city);
  const pins: MapDayPin[] = [];

  for (const pin of day.mapPins ?? []) {
    if (!isValidMapCoord(pin.lat, pin.lng)) continue;
    const category = normalizeMapPoiCategory(pin.category);
    if (!travel && (category === "airport" || isLogisticsName(pin.name))) continue;
    if (!travel && isAirportRunwayCoord({ lat: pin.lat, lng: pin.lng })) continue;
    if (haversineKm([center.lng, center.lat], [pin.lng, pin.lat]) > MAX_PIN_FROM_CENTER_KM) {
      continue;
    }
    const n = pin.name.trim().toLowerCase();
    if (!n || n === city.toLowerCase()) continue;

    const nameKey = fuzzyNameKey(pin.name);
    const imageUrl =
      pin.imageUrl?.trim() || activityImageByName(day, pin.name) || undefined;
    const existing = pins.find(
      (p) =>
        haversineKm([p.lng, p.lat], [pin.lng, pin.lat]) < COLOCATE_KM ||
        (nameKey.length >= 5 && fuzzyNameKey(p.name) === nameKey),
    );
    if (existing) {
      if (pin.name.trim().length > existing.name.trim().length) {
        existing.name = pin.name;
        existing.description = pin.description ?? existing.description;
      }
      if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
      continue;
    }
    if (pins.length >= MAX_DAY_PINS) break;
    pins.push({
      id: `pin-${day.day}-${pins.length}-${nameKey || "x"}`,
      name: pin.name,
      lat: pin.lat,
      lng: pin.lng,
      category,
      description: pin.description,
      arrivalTime: pin.arrivalTime,
      departureTime: pin.departureTime,
      estimatedCostEur: pin.estimatedCostEur,
      imageUrl,
    });
  }

  return pins;
}

function inferLegMode(day: DayPlan, distKm: number): MapDayLeg["mode"] {
  if ((day.transportation ?? []).some((t) => t.type === "flight") || day.inFlightDay) {
    return "flight";
  }
  if ((day.transportation ?? []).some((t) => t.type === "ferry")) return "ferry";
  const title = day.title ?? "";
  if (/trajekt|ferry/i.test(title)) return "ferry";
  if (/let|flight|airport/i.test(title) || distKm > 900) return "flight";
  return "drive";
}

/**
 * Build the map day view. Reads coords already on the plan — does not geocode.
 */
export function buildMapDay(plan: AiTripPlan, activeDay: number): MapDay | null {
  const day = plan.days.find((d) => d.day === activeDay);
  if (!day) return null;
  const center = resolveCityCenter(day);
  if (!center) return null;

  const cityLabel =
    normalizeCityLabel(day.city) ||
    normalizeCityLabel(day.focusName) ||
    `Day ${day.day}`;

  const pins = collectPins(day, center);

  let legIn: MapDayLeg | undefined;
  if (isTravelDay(day)) {
    const prev = plan.days.find((d) => d.day === activeDay - 1);
    const prevCenter = prev ? resolveCityCenter(prev) : null;
    if (prevCenter) {
      const dist = haversineKm(
        [prevCenter.lng, prevCenter.lat],
        [center.lng, center.lat],
      );
      if (dist >= MIN_ROUTE_DRAW_KM) {
        legIn = {
          mode: inferLegMode(day, dist),
          from: prevCenter,
          to: center,
        };
      }
    }
  }

  return { day: activeDay, cityLabel, center, pins, legIn };
}

export function cameraForMapDay(
  view: MapDay,
  opts?: { playing?: boolean },
): { center: [number, number]; zoom: number } {
  return {
    center: [view.center.lng, view.center.lat],
    zoom: opts?.playing ? PLAY_VIEW_ZOOM : DAY_VIEW_ZOOM,
  };
}

/**
 * Resolve city centers once at plan finalize.
 * Writes city centroids onto day.lat/lng so the map never sees runway AI dumps.
 * Does not call Mapbox (offline-safe); Geocoding can fill gaps earlier in the pipeline.
 */
export function finalizeItineraryMapCoords(plan: AiTripPlan): AiTripPlan {
  for (const day of plan.days) {
    const center = resolveCityCenter(day);
    if (center) {
      day.lat = center.lat;
      day.lng = center.lng;
    }

    const travel = isTravelDay(day);
    if (!day.mapPins?.length) continue;

    const kept: NonNullable<DayPlan["mapPins"]> = [];
    for (const pin of day.mapPins) {
      if (!isValidMapCoord(pin.lat, pin.lng)) continue;
      const cat = normalizeMapPoiCategory(pin.category);
      if (!travel && (cat === "airport" || isLogisticsName(pin.name))) continue;
      if (!travel && isAirportRunwayCoord({ lat: pin.lat, lng: pin.lng })) continue;
      kept.push(pin);
    }
    day.mapPins = kept.length > 0 ? kept : undefined;
  }
  return plan;
}
