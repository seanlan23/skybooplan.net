/**
 * Pure day-view model for the itinerary map.
 * One day → one city center → few local pins. Routes never own the camera.
 * Airport hubs never steal sightseeing days (Tokyo ≠ HND/NRT).
 */
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  normalizeMapPoiCategory,
  resolveMapPoiCategory,
  type MapPoiCategory,
} from "@/lib/mapPoiCategory";
import {
  findActivityPinFuzzy,
  resolveActivityCoordinates,
  shouldShowActivityOnMap,
} from "@/lib/mapPoiResolver";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { lookupPoiCoords } from "@/lib/tripGeo";
import { haversineKm } from "@/lib/tripMapRoutes";

export const MAX_DAY_PINS = 4;
/** Pins farther than this from the day center are dropped. */
export const MAX_PIN_FROM_CENTER_KM = 55;
/** Merge pins closer than this (stops duplicate stacks). */
export const COLOCATE_KM = 1.2;
export const DAY_VIEW_ZOOM = 11.5;
export const PLAY_VIEW_ZOOM = 11.8;
export const POI_FOCUS_ZOOM = 13.2;
/** Inbound travel lines only when the leg is at least this long. */
export const MIN_ROUTE_DRAW_KM = 40;
/** Treat as airport runway if within this of a known hub. */
const AIRPORT_SNAP_KM = 12;

export type DayMapPin = {
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

export type DayInboundRoute = {
  from: [number, number];
  to: [number, number];
  mode: "flight" | "ferry" | "driving";
};

export type DayMapView = {
  day: number;
  city: string;
  /** [lng, lat] */
  center: [number, number];
  pins: DayMapPin[];
  inboundRoute: DayInboundRoute | null;
};

export function isValidMapCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return true;
}

export function normalizeMapLocationText(value: unknown): string {
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

/** True only for real travel/relocation days — not every day that mentions check-in. */
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

/** IATA only — never match city name "Tokyo" to NRT runway coords. */
function lookupIataHub(text: string): { lat: number; lng: number; code: string } | null {
  for (const m of text.toUpperCase().matchAll(/\b([A-Z]{3})\b/g)) {
    const code = m[1]!;
    const meta = DESTINATION_BY_IATA[code];
    if (meta) return { lat: meta.lat, lng: meta.lng, code };
  }
  return null;
}

function nearestAirportHub(coord: { lat: number; lng: number }): {
  code: string;
  lat: number;
  lng: number;
  km: number;
} | null {
  let best: { code: string; lat: number; lng: number; km: number } | null = null;
  for (const [code, meta] of Object.entries(DESTINATION_BY_IATA)) {
    const km = haversineKm([coord.lng, coord.lat], [meta.lng, meta.lat]);
    if (km > AIRPORT_SNAP_KM) continue;
    if (!best || km < best.km) best = { code, lat: meta.lat, lng: meta.lng, km };
  }
  return best;
}

function isAirportRunwayCoord(coord: { lat: number; lng: number }): boolean {
  return nearestAirportHub(coord) != null;
}

function fuzzyNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9čšžćđäöüáéíóú\s]/gi, "")
    .replace(/\b(the|a|an|hotel|temple|wat|plaža|beach)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
}

/**
 * Resolve the geographic center for a day.
 * City label wins; airport runways never win on sightseeing days.
 */
export function resolveDayCenter(day: DayPlan): [number, number] | null {
  const city = normalizeMapLocationText(day.city);
  const focus = normalizeMapLocationText(day.focusName);
  const title = normalizeMapLocationText(day.title);
  const travel = isTravelDay(day);

  const cityKnown =
    (city ? lookupRegionCoords(city) : null) ??
    (focus ? lookupRegionCoords(focus) : null) ??
    (city ? lookupPoiCoords(city) : null) ??
    (focus ? lookupPoiCoords(focus) : null);

  // IATA hubs only when this is actually a flight day (MUC departure / NRT arrival).
  const iataHub = travel
    ? lookupIataHub(`${city} ${title}`) ?? lookupIataHub(title)
    : null;

  const known = cityKnown ?? (iataHub ? { lat: iataHub.lat, lng: iataHub.lng } : null);

  const ai =
    isValidMapCoord(day.lat, day.lng) ? ({ lat: day.lat, lng: day.lng } as const) : null;

  if (known && ai) {
    const dist = haversineKm([ai.lng, ai.lat], [known.lng, known.lat]);
    if (dist > 60) return [known.lng, known.lat];
    if (!travel && isAirportRunwayCoord(ai)) return [known.lng, known.lat];
    // Prefer city centroid over AI even when close — AI often dumps HND for "Tokyo".
    if (!travel && cityKnown) return [cityKnown.lng, cityKnown.lat];
    return [ai.lng, ai.lat];
  }
  if (known) return [known.lng, known.lat];
  if (ai && (travel || !isAirportRunwayCoord(ai))) return [ai.lng, ai.lat];

  for (const pin of day.mapPins ?? []) {
    if (!isValidMapCoord(pin.lat, pin.lng)) continue;
    const cat = normalizeMapPoiCategory(pin.category);
    if (cat === "airport" && !travel) continue;
    if (!travel && isAirportRunwayCoord({ lat: pin.lat, lng: pin.lng })) continue;
    return [pin.lng, pin.lat];
  }

  return null;
}

function isGenericCityPinName(name: string, city: string): boolean {
  const n = name.trim().toLowerCase();
  const c = city.trim().toLowerCase();
  if (!n) return true;
  if (c && (n === c || n === `mesto ${c}` || n === `city of ${c}`)) return true;
  return false;
}

function isLogisticsPinName(name: string): boolean {
  return /^(odhod|departure|prihod|arrival|check-?in|prevoz|transfer|letališč|airport|mednarodni let|notranji let)\b/i.test(
    name.trim(),
  );
}

function pushPin(
  pins: DayMapPin[],
  center: [number, number],
  city: string,
  source: DayMapPin,
  travel: boolean,
): void {
  if (!isValidMapCoord(source.lat, source.lng)) return;
  if (isGenericCityPinName(source.name, city)) return;
  if (!travel && (source.category === "airport" || isLogisticsPinName(source.name))) return;
  if (!travel && isAirportRunwayCoord({ lat: source.lat, lng: source.lng })) return;
  if (haversineKm(center, [source.lng, source.lat]) > MAX_PIN_FROM_CENTER_KM) return;
  if (pins.length >= MAX_DAY_PINS) return;

  const nameKey = fuzzyNameKey(source.name);
  const existing = pins.find(
    (p) =>
      haversineKm([p.lng, p.lat], [source.lng, source.lat]) < COLOCATE_KM ||
      (nameKey.length >= 5 && fuzzyNameKey(p.name) === nameKey),
  );
  if (existing) {
    if (source.name.trim().length > existing.name.trim().length) {
      existing.name = source.name;
      existing.description = source.description ?? existing.description;
    }
    existing.imageUrl = source.imageUrl ?? existing.imageUrl;
    existing.category = source.category;
    return;
  }

  pins.push(source);
}

/** Prefer curated mapPins; otherwise activities. Never both. */
export function collectDayPins(day: DayPlan, center: [number, number]): DayMapPin[] {
  const city = normalizeMapLocationText(day.city) || `Day ${day.day}`;
  const pins: DayMapPin[] = [];
  const travel = isTravelDay(day);

  for (const pin of day.mapPins ?? []) {
    if (!isValidMapCoord(pin.lat, pin.lng)) continue;
    const category = normalizeMapPoiCategory(pin.category);
    const coords = resolveActivityCoordinates(
      { name: pin.name, lat: pin.lat, lng: pin.lng },
      day,
    );
    if (!coords) continue;
    pushPin(
      pins,
      center,
      city,
      {
        name: pin.name,
        lat: coords.lat,
        lng: coords.lng,
        category,
        description: pin.description,
        arrivalTime: pin.arrivalTime,
        departureTime: pin.departureTime,
        estimatedCostEur: pin.estimatedCostEur,
        imageUrl: pin.imageUrl,
      },
      travel,
    );
  }

  if (pins.length > 0) return pins;

  const slots = day.activities;
  if (!slots) return pins;
  for (const act of [...slots.morning, ...slots.afternoon, ...slots.evening]) {
    if (!shouldShowActivityOnMap(act)) continue;
    if (!travel && (act.transportType || act.type === "TRANSPORT")) continue;
    const coords = resolveActivityCoordinates(act, day);
    if (!coords) continue;
    const fuzzy = findActivityPinFuzzy(day, act);
    const category = resolveMapPoiCategory({
      name: act.name,
      description: act.description,
      type: act.type,
      transportType: act.transportType,
      pinCategory: fuzzy?.category,
    });
    pushPin(
      pins,
      center,
      city,
      {
        name: act.name,
        lat: coords.lat,
        lng: coords.lng,
        category,
        description: act.description,
        arrivalTime: act.arrivalTime,
        departureTime: act.departureTime,
        estimatedCostEur: act.estimatedCostEur,
        imageUrl: act.imageUrl ?? fuzzy?.imageUrl,
      },
      travel,
    );
  }

  return pins;
}

function inferInboundMode(day: DayPlan, distKm: number): DayInboundRoute["mode"] {
  if ((day.transportation ?? []).some((t) => t.type === "ferry")) return "ferry";
  if ((day.transportation ?? []).some((t) => t.type === "flight") || day.inFlightDay) {
    return "flight";
  }
  const blob = `${day.title}`;
  if (/trajekt|ferry/i.test(blob)) return "ferry";
  if (/let|flight|airport/i.test(blob) || distKm > 900) return "flight";
  return "driving";
}

export function buildDayMapView(
  plan: AiTripPlan,
  activeDay: number,
): DayMapView | null {
  const day = plan.days.find((d) => d.day === activeDay);
  if (!day) return null;

  const center = resolveDayCenter(day);
  if (!center) return null;

  const pins = collectDayPins(day, center);
  const city =
    normalizeMapLocationText(day.city) ||
    normalizeMapLocationText(day.focusName) ||
    `Day ${day.day}`;

  let inboundRoute: DayInboundRoute | null = null;
  if (isTravelDay(day)) {
    const prev = plan.days.find((d) => d.day === activeDay - 1);
    const prevCenter = prev ? resolveDayCenter(prev) : null;
    if (prevCenter) {
      const dist = haversineKm(prevCenter, center);
      if (dist >= MIN_ROUTE_DRAW_KM) {
        inboundRoute = {
          from: prevCenter,
          to: center,
          mode: inferInboundMode(day, dist),
        };
      }
    }
  }

  return { day: activeDay, city, center, pins, inboundRoute };
}

/**
 * Camera always follows day city center.
 * Drone/POI focus only highlights a pin — it must NOT yank the viewport (Layla-style).
 */
export function cameraForDayView(
  view: DayMapView,
  opts?: { playing?: boolean; focus?: { lat: number; lng: number } | null },
): { center: [number, number]; zoom: number } {
  void opts?.focus;
  return {
    center: view.center,
    zoom: opts?.playing ? PLAY_VIEW_ZOOM : DAY_VIEW_ZOOM,
  };
}
