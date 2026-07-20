/**
 * Pure day-view model for the itinerary map.
 * One day → one center → few local pins. Routes never own the camera.
 */
import type { Activity, AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
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

const AIRPORT_HUB_IATAS = new Set([
  "DMK",
  "BKK",
  "HKT",
  "CNX",
  "KBV",
  "MUC",
  "FRA",
  "VIE",
  "ZRH",
]);

function lookupHubByNameOrIata(text: string): { lat: number; lng: number } | null {
  const raw = text.trim();
  if (!raw) return null;
  // Prefer explicit IATA tokens (MUC), not substrings inside words (INN in "dinner").
  for (const m of raw.toUpperCase().matchAll(/\b([A-Z]{3})\b/g)) {
    const meta = DESTINATION_BY_IATA[m[1]!];
    if (meta) return { lat: meta.lat, lng: meta.lng };
  }
  const lower = raw.toLowerCase();
  for (const meta of Object.values(DESTINATION_BY_IATA)) {
    const name = meta.name.toLowerCase();
    if (lower === name || lower.startsWith(`${name} `) || lower.includes(` ${name}`)) {
      return { lat: meta.lat, lng: meta.lng };
    }
  }
  return null;
}

function isAirportHubCoord(
  coord: { lat: number; lng: number },
  cityLabel: string,
): boolean {
  for (const code of AIRPORT_HUB_IATAS) {
    const hub = DESTINATION_BY_IATA[code];
    if (!hub) continue;
    if (haversineKm([coord.lng, coord.lat], [hub.lng, hub.lat]) < 8) {
      // City is the airport hub itself (e.g. departure day at MUC) → OK.
      const city = cityLabel.toLowerCase();
      if (city.includes(hub.name.toLowerCase()) || city.includes(code.toLowerCase())) {
        return false;
      }
      // Bangkok city day with DMK coords → treat as airport pin, prefer city.
      if (/bangkok|phuket|chiang mai|krabi|munich|wien|vienna/i.test(cityLabel)) {
        return true;
      }
    }
  }
  return false;
}

export const MAX_DAY_PINS = 5;
/** Pins farther than this from the day center are dropped. */
export const MAX_PIN_FROM_CENTER_KM = 80;
/** Merge pins closer than this. */
export const COLOCATE_KM = 0.55;
export const DAY_VIEW_ZOOM = 11.8;
export const PLAY_VIEW_ZOOM = 12.4;
export const POI_FOCUS_ZOOM = 14.2;
/** Inbound travel lines only when the leg is at least this long. */
export const MIN_ROUTE_DRAW_KM = 40;

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

export function isTravelDay(day: DayPlan): boolean {
  if (day.inFlightDay) return true;
  if ((day.transportation ?? []).some((t) => t.type === "flight" || t.type === "ferry")) {
    return true;
  }
  const blob = `${day.title} ${day.morning} ${day.afternoon} ${day.evening} ${day.city ?? ""}`;
  return /letalo|flight|airport|odlet|prilet|check-in|letališč|trajekt|ferry|transfer to|prevoz do/i.test(
    blob,
  );
}

/**
 * Resolve the geographic center for a day.
 * City label wins over a stray airport/origin pin in AI lat/lng.
 */
export function resolveDayCenter(day: DayPlan): [number, number] | null {
  const city = normalizeMapLocationText(day.city);
  const focus = normalizeMapLocationText(day.focusName);
  const title = normalizeMapLocationText(day.title);
  const known =
    (city ? lookupRegionCoords(city) : null) ??
    (focus ? lookupRegionCoords(focus) : null) ??
    (city ? lookupPoiCoords(city) : null) ??
    (focus ? lookupPoiCoords(focus) : null) ??
    lookupHubByNameOrIata(city) ??
    lookupHubByNameOrIata(title) ??
    lookupHubByNameOrIata(`${city} ${title}`);

  const ai =
    isValidMapCoord(day.lat, day.lng) ? ({ lat: day.lat, lng: day.lng } as const) : null;

  if (known && ai) {
    const dist = haversineKm([ai.lng, ai.lat], [known.lng, known.lat]);
    // AI coords that disagree with the city name (Bangkok on a Munich day) → trust city.
    if (dist > 75) return [known.lng, known.lat];
    // Sightseeing in Bangkok with DMK/BKK runway coords → city center, not airport.
    if (!isTravelDay(day) && isAirportHubCoord(ai, city || title)) {
      return [known.lng, known.lat];
    }
    return [ai.lng, ai.lat];
  }
  if (known) return [known.lng, known.lat];
  if (ai) return [ai.lng, ai.lat];

  for (const pin of day.mapPins ?? []) {
    if (!isValidMapCoord(pin.lat, pin.lng)) continue;
    const cat = normalizeMapPoiCategory(pin.category);
    if (cat === "airport" && !isTravelDay(day)) continue;
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

function pushPin(
  pins: DayMapPin[],
  center: [number, number],
  city: string,
  source: DayMapPin,
): void {
  if (!isValidMapCoord(source.lat, source.lng)) return;
  if (isGenericCityPinName(source.name, city)) return;
  if (haversineKm(center, [source.lng, source.lat]) > MAX_PIN_FROM_CENTER_KM) return;
  if (pins.length >= MAX_DAY_PINS) return;

  const existing = pins.find(
    (p) => haversineKm([p.lng, p.lat], [source.lng, source.lat]) < COLOCATE_KM,
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
    if (category === "airport" && !travel) continue;
    const coords = resolveActivityCoordinates(
      { name: pin.name, lat: pin.lat, lng: pin.lng },
      day,
    );
    if (!coords) continue;
    pushPin(pins, center, city, {
      name: pin.name,
      lat: coords.lat,
      lng: coords.lng,
      category,
      description: pin.description,
      arrivalTime: pin.arrivalTime,
      departureTime: pin.departureTime,
      estimatedCostEur: pin.estimatedCostEur,
      imageUrl: pin.imageUrl,
    });
  }

  if (pins.length > 0) return pins;

  const slots = day.activities;
  if (!slots) return pins;
  for (const act of [...slots.morning, ...slots.afternoon, ...slots.evening]) {
    if (!shouldShowActivityOnMap(act)) continue;
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
    if (category === "airport" && !travel) continue;
    pushPin(pins, center, city, {
      name: act.name,
      lat: coords.lat,
      lng: coords.lng,
      category,
      description: act.description,
      arrivalTime: act.arrivalTime,
      departureTime: act.departureTime,
      estimatedCostEur: act.estimatedCostEur,
      imageUrl: act.imageUrl ?? fuzzy?.imageUrl,
    });
  }

  return pins;
}

function inferInboundMode(day: DayPlan, distKm: number): DayInboundRoute["mode"] {
  if ((day.transportation ?? []).some((t) => t.type === "ferry")) return "ferry";
  if ((day.transportation ?? []).some((t) => t.type === "flight") || day.inFlightDay) {
    return "flight";
  }
  const blob = `${day.title} ${day.morning}`;
  if (/trajekt|ferry|boat|čoln/i.test(blob)) return "ferry";
  if (/letalo|flight|airport|odlet|prilet/i.test(blob) || distKm > 900) return "flight";
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
  const city = normalizeMapLocationText(day.city) || normalizeMapLocationText(day.focusName) || `Day ${day.day}`;

  let inboundRoute: DayInboundRoute | null = null;
  if (isTravelDay(day) || activeDay > 1) {
    const prev = plan.days.find((d) => d.day === activeDay - 1);
    const prevCenter = prev ? resolveDayCenter(prev) : null;
    if (prevCenter) {
      const dist = haversineKm(prevCenter, center);
      // Only draw a real relocation leg — never stretch sightseeing days across oceans.
      if (dist >= MIN_ROUTE_DRAW_KM && (isTravelDay(day) || dist < 500)) {
        inboundRoute = {
          from: prevCenter,
          to: center,
          mode: inferInboundMode(day, dist),
        };
      }
    }
  }

  // Intercontinental inbound on a sightseeing day → drop the line entirely.
  if (
    inboundRoute &&
    !isTravelDay(day) &&
    haversineKm(inboundRoute.from, inboundRoute.to) > 500
  ) {
    inboundRoute = null;
  }

  return { day: activeDay, city, center, pins, inboundRoute };
}

/** Camera target for a day — never uses route endpoints. */
export function cameraForDayView(
  view: DayMapView,
  opts?: { playing?: boolean; focus?: { lat: number; lng: number } | null },
): { center: [number, number]; zoom: number } {
  if (opts?.focus && isValidMapCoord(opts.focus.lat, opts.focus.lng)) {
    return { center: [opts.focus.lng, opts.focus.lat], zoom: POI_FOCUS_ZOOM };
  }
  return {
    center: view.center,
    zoom: opts?.playing ? PLAY_VIEW_ZOOM : DAY_VIEW_ZOOM,
  };
}
