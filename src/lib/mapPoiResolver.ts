import type { Activity, DayPlan } from "@/lib/aiPlan.functions";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { resolveMapPoiCategory, type MapPoiCategory } from "@/lib/mapPoiCategory";
import { lookupPoiCoords, lookupRegionCoords } from "@/lib/tripGeo";
import { haversineKm } from "@/lib/tripMapRoutes";

const MAX_DAY_PIN_KM = 45;

function isValidCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 || lng === 0) return false;
  return true;
}

function fuzzyNameMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y;
  const long = x.length <= y.length ? y : x;
  if (short.length >= 8 && long.includes(short.slice(0, Math.min(24, short.length)))) return true;
  return false;
}

export function findActivityPinFuzzy(
  day: DayPlan,
  activity: Activity,
): NonNullable<DayPlan["mapPins"]>[number] | undefined {
  const pins = day.mapPins ?? [];
  const exact = pins.find((p) => p.name.trim().toLowerCase() === activity.name.trim().toLowerCase());
  if (exact) return exact;
  return pins.find((p) => fuzzyNameMatch(p.name, activity.name));
}

export function extractIataCodes(text: string): string[] {
  const codes: string[] = [];
  for (const m of text.matchAll(/\(([A-Z]{3})\)/g)) {
    if (DESTINATION_BY_IATA[m[1]!]) codes.push(m[1]!);
  }
  for (const m of text.matchAll(/\b([A-Z]{3})\b/g)) {
    if (DESTINATION_BY_IATA[m[1]!]) codes.push(m[1]!);
  }
  return [...new Set(codes)];
}

function coordsFromIata(text: string, which: "first" | "last"): { lat: number; lng: number } | null {
  const codes = extractIataCodes(text);
  if (!codes.length) return null;
  const code = which === "last" ? codes[codes.length - 1]! : codes[0]!;
  const meta = DESTINATION_BY_IATA[code];
  return meta ? { lat: meta.lat, lng: meta.lng } : null;
}

function dayCenter(day: DayPlan): { lat: number; lng: number } | null {
  if (isValidCoord(day.lat, day.lng)) return { lat: day.lat, lng: day.lng };
  return lookupRegionCoords(day.city);
}

function destinationFromRouteName(name: string): { lat: number; lng: number } | null {
  const parts = name.split(/\s*(?:→|->|—|–)\s*/);
  const dest = parts[parts.length - 1]?.trim();
  if (!dest) return null;
  const city = dest.replace(/\([^)]*\)/g, "").trim();
  return lookupRegionCoords(city);
}

function isFlightLike(activity: Activity): boolean {
  if (activity.transportType === "flight") return true;
  const text = `${activity.name} ${activity.description ?? ""}`.toLowerCase();
  return /\b(notranji let|mednarodni let|domestic flight|international flight)\b/.test(text);
}

function isTrainLike(activity: Activity): boolean {
  if (activity.transportType === "train") return true;
  return /\b(vlak|train|rail)\b/i.test(activity.name);
}

/** Resolve best map coordinates for an activity — curated POI > IATA > pin > AI coords. */
export function resolveActivityCoordinates(
  activity: Activity,
  day: DayPlan,
): { lat: number; lng: number } | null {
  const pin = findActivityPinFuzzy(day, activity);
  const center = dayCenter(day);

  if (isFlightLike(activity)) {
    const first = coordsFromIata(activity.name, "first");
    const last = coordsFromIata(activity.name, "last");
    if (first && last && center) {
      const dFirst = haversineKm([first.lng, first.lat], [center.lng, center.lat]);
      const dLast = haversineKm([last.lng, last.lat], [center.lng, center.lat]);
      return dFirst <= dLast ? first : last;
    }
    if (first ?? last) return first ?? last;
  }

  const curated = lookupPoiCoords(activity.name);
  if (curated) return curated;

  if (isTrainLike(activity) || activity.transportType === "ferry") {
    const dest = destinationFromRouteName(activity.name);
    if (dest) return dest;
  }

  let lat = activity.lat ?? pin?.lat;
  let lng = activity.lng ?? pin?.lng;

  if (!isValidCoord(lat, lng)) {
    if (center) return center;
    return null;
  }

  if (center) {
    const distKm = haversineKm([lng, lat], [center.lng, center.lat]);
    if (distKm > MAX_DAY_PIN_KM) {
      const dest = destinationFromRouteName(activity.name);
      if (dest && haversineKm([dest.lng, dest.lat], [center.lng, center.lat]) <= MAX_DAY_PIN_KM) {
        return dest;
      }
      const retry = lookupPoiCoords(`${activity.name} ${day.city}`);
      if (retry && haversineKm([retry.lng, retry.lat], [center.lng, center.lat]) <= MAX_DAY_PIN_KM) {
        return retry;
      }
      return null;
    }
  }

  return { lat, lng };
}

export function shouldShowActivityOnMap(activity: Activity): boolean {
  const name = activity.name.trim();
  if (!name || /^prevoz:/i.test(name)) return false;
  if (/prosti dan|free day|raziskovanje okolice/i.test(name)) return false;
  return true;
}

export function resolveActivityMapCategory(
  activity: Activity,
  pin?: { category?: string },
): MapPoiCategory {
  return resolveMapPoiCategory({
    name: activity.name,
    description: activity.description,
    type: activity.type,
    transportType: activity.transportType,
    pinCategory: pin?.category,
  });
}

/** Copy resolved coords onto activities so plan clicks and map pins stay aligned. */
export function attachActivityCoordinates(day: DayPlan): DayPlan {
  const slots = day.activities;
  if (!slots) return day;

  const patch = (activities: Activity[]): Activity[] =>
    activities.map((act) => {
      if (isValidCoord(act.lat, act.lng)) return act;
      const coords = resolveActivityCoordinates(act, day);
      if (!coords) return act;
      return { ...act, lat: coords.lat, lng: coords.lng };
    });

  return {
    ...day,
    activities: {
      morning: patch(slots.morning),
      afternoon: patch(slots.afternoon),
      evening: patch(slots.evening),
    },
  };
}
