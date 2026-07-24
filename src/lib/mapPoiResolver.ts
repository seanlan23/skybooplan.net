import type { Activity, DayPlan } from "@/lib/aiPlan.functions";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { resolveMapPoiCategory, type MapPoiCategory } from "@/lib/mapPoiCategory";
import { lookupPoiCoords } from "@/lib/tripGeo";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { haversineKm } from "@/lib/geoMath";

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

function activityBlob(activity: Activity): string {
  return `${activity.name} ${activity.description ?? ""}`;
}

/** Arrival-day logistics (“Prihod na letališče”) — map should go to destination hub, not origin MXP. */
function isAirportArrivalLike(activity: Activity): boolean {
  const t = activityBlob(activity);
  return /prihod na letališč|airport arrival|\bpristane\b|\blands at\b|arrival hall|immigration|prevzem prtljag/i.test(
    t,
  );
}

function isAirportDepartureLike(activity: Activity): boolean {
  const t = activityBlob(activity);
  return /^(odhod|departure)\b|odhod:|departure:|odlet|home airport|prevoz na letališč|transfer to (?:the )?airport/i.test(
    t,
  );
}

function isDayHubLogistics(activity: Activity): boolean {
  return (
    isAirportArrivalLike(activity) ||
    isAirportDepartureLike(activity) ||
    /check-?\s*in|prevoz do hotela|transfer to hotel|osvežitev|short rest/i.test(activity.name)
  );
}

/** Pick IATA coords nearest the day city (arrival on Manila day → MNL, not leftover MXP). */
function iataCoordsNearDay(
  text: string,
  center: { lat: number; lng: number } | null,
  prefer: "first" | "last" | "nearest",
): { lat: number; lng: number } | null {
  const codes = extractIataCodes(text);
  if (!codes.length) return null;
  if (prefer === "first") return coordsFromIata(text, "first");
  if (prefer === "last") return coordsFromIata(text, "last");
  if (!center) return coordsFromIata(text, "last");
  let best: { lat: number; lng: number } | null = null;
  let bestKm = Infinity;
  for (const code of codes) {
    const meta = DESTINATION_BY_IATA[code];
    if (!meta) continue;
    const km = haversineKm([meta.lng, meta.lat], [center.lng, center.lat]);
    if (km < bestKm) {
      bestKm = km;
      best = { lat: meta.lat, lng: meta.lng };
    }
  }
  return best;
}

function resolveAirportLogisticsCoords(
  activity: Activity,
  day: DayPlan,
  center: { lat: number; lng: number } | null,
): { lat: number; lng: number } | null {
  const blob = activityBlob(activity);
  if (isAirportDepartureLike(activity)) {
    return (
      iataCoordsNearDay(blob, center, "first") ??
      iataCoordsNearDay(activity.name, center, "first") ??
      center
    );
  }
  if (isAirportArrivalLike(activity) || /letališč|airport/i.test(activity.name)) {
    return (
      iataCoordsNearDay(blob, center, "nearest") ??
      lookupRegionCoords(day.city) ??
      center
    );
  }
  if (isDayHubLogistics(activity)) {
    return center ?? lookupRegionCoords(day.city);
  }
  return null;
}

const WATER_OK =
  /snork|diving|potop|plavanje|swim|boat|čoln|maya bay|phi lay|bay tour|cruise|izlet z lad|kayak|kajak/i;
const LAND_PREF =
  /kosilo|lunch|dinner|večerja|zajtrk|breakfast|hotel|prijava|check-?\s*in|check-?\s*out|restavrac|café|kavarn|street food|tržnica/i;

/** Food/hotel pins Gemini drops in open water → snap to day land hub (e.g. Tonsai). */
function snapLandPreferringPin(
  activity: Activity,
  day: DayPlan,
  coords: { lat: number; lng: number },
): { lat: number; lng: number } {
  const text = `${activity.name} ${activity.description ?? ""}`;
  if (WATER_OK.test(text) && !LAND_PREF.test(text)) return coords;

  const category = resolveActivityMapCategory(activity);
  const landLike =
    category === "food" ||
    category === "hotel" ||
    LAND_PREF.test(text);
  if (!landLike) return coords;

  const center = dayCenter(day);
  if (!center) return coords;

  const distKm = haversineKm([coords.lng, coords.lat], [center.lng, center.lat]);
  // Offshore lunch west of Phi Phi is typically 1.5–4 km from Tonsai.
  if (distKm > 1.2) return center;
  return coords;
}

/**
 * True when the activity is a concrete place (restaurant, landmark, hotel…)
 * that should offer Google Maps navigation — not generic flight/security fluff.
 */
export function shouldOfferActivityNavigation(
  activity: Activity,
  day: DayPlan,
): boolean {
  if (isFlightLike(activity)) return false;
  const name = `${activity.name} ${activity.description ?? ""}`;
  if (
    /\b(check-in|controlli di sicurezza|security check|immigraz|baggage claim|ritiro bagagli|decollo|take-?off|boarding)\b/i.test(
      name,
    ) &&
    !/\b(hotel|ristorante|restaurant|museo|museum|temple|wat\b|beach|spiaggia)\b/i.test(name)
  ) {
    return false;
  }
  const coords = resolveActivityCoordinates(activity, day);
  if (!coords) return false;
  // Prefer AI/curated coords — avoid offering nav for pure day-center guesses.
  const pin = findActivityPinFuzzy(day, activity);
  const hasExplicit =
    typeof activity.lat === "number" &&
    typeof activity.lng === "number" &&
    isValidCoord(activity.lat, activity.lng);
  if (hasExplicit || pin || lookupPoiCoords(activity.name)) return true;
  const type = String(activity.type ?? "").toUpperCase();
  return ["EAT", "SIGHT", "HOTEL", "NATURE", "BEACH", "ENTERTAINMENT", "FOOD"].includes(type);
}

/** Resolve best map coordinates for an activity — curated POI > IATA > pin > AI coords. */
export function resolveActivityCoordinates(
  activity: Activity,
  day: DayPlan,
): { lat: number; lng: number } | null {
  const pin = findActivityPinFuzzy(day, activity);
  const center = dayCenter(day);

  // Arrival/departure logistics often lack lat/lng or inherit origin-airport coords.
  if (isDayHubLogistics(activity) || isAirportArrivalLike(activity) || isAirportDepartureLike(activity)) {
    const hub = resolveAirportLogisticsCoords(activity, day, center);
    if (hub) return hub;
  }

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
  if (curated) {
    // Never pin Bangkok temples onto a Khao Sok / Phuket day — hide instead.
    if (center) {
      const distKm = haversineKm(
        [curated.lng, curated.lat],
        [center.lng, center.lat],
      );
      if (distKm > MAX_DAY_PIN_KM) return null;
    }
    return snapLandPreferringPin(activity, day, curated);
  }

  if (isTrainLike(activity) || activity.transportType === "ferry") {
    const dest = destinationFromRouteName(activity.name);
    if (dest) return dest;
  }

  let lat = activity.lat ?? pin?.lat;
  let lng = activity.lng ?? pin?.lng;

  if (!isValidCoord(lat, lng)) {
    const hub = resolveAirportLogisticsCoords(activity, day, center);
    if (hub) return hub;
    // Never pin unknown POIs on the day city center — that stuck "Bangkok Art…" on Khao Sok.
    return null;
  }

  if (center) {
    const distKm = haversineKm([lng, lat], [center.lng, center.lat]);
    if (distKm > MAX_DAY_PIN_KM) {
      const hub = resolveAirportLogisticsCoords(activity, day, center);
      if (hub && haversineKm([hub.lng, hub.lat], [center.lng, center.lat]) <= MAX_DAY_PIN_KM * 3) {
        return hub;
      }
      const dest = destinationFromRouteName(activity.name);
      if (dest && haversineKm([dest.lng, dest.lat], [center.lng, center.lat]) <= MAX_DAY_PIN_KM) {
        return dest;
      }
      const retry = lookupPoiCoords(`${activity.name} ${day.city}`);
      if (retry && haversineKm([retry.lng, retry.lat], [center.lng, center.lat]) <= MAX_DAY_PIN_KM) {
        return snapLandPreferringPin(activity, day, retry);
      }
      return null;
    }
  }

  return snapLandPreferringPin(activity, day, { lat, lng });
}

export function shouldShowActivityOnMap(activity: Activity): boolean {
  const name = activity.name.trim();
  if (!name || /^prevoz:/i.test(name)) return false;
  if (/prosti dan|free day|raziskovanje okolice/i.test(name)) return false;
  // Logistics / airport steps clutter the map and snap to runways.
  if (activity.type === "TRANSPORT" || activity.transportType) return false;
  if (
    /^(odhod|departure|prihod na letališč|arrival at|check-?in|prevoz do hotela|transfer to hotel|mednarodni let|notranji let)\b/i.test(
      name,
    )
  ) {
    return false;
  }
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
      // Always re-resolve — curated land coords must override Gemini offshore pins.
      const coords = resolveActivityCoordinates(act, day);
      if (!coords) return act;
      if (
        isValidCoord(act.lat, act.lng) &&
        act.lat === coords.lat &&
        act.lng === coords.lng
      ) {
        return act;
      }
      return { ...act, lat: coords.lat, lng: coords.lng };
    });

  // Snap mapPins the same way (popup/marker sources).
  const mapPins = (day.mapPins ?? []).map((pin) => {
    const asAct: Activity = {
      name: pin.name,
      description: pin.description,
      lat: pin.lat,
      lng: pin.lng,
      type: pin.category,
    };
    const coords = resolveActivityCoordinates(asAct, day);
    if (!coords) return pin;
    if (pin.lat === coords.lat && pin.lng === coords.lng) return pin;
    return { ...pin, lat: coords.lat, lng: coords.lng };
  });

  return {
    ...day,
    ...(mapPins.length ? { mapPins } : {}),
    activities: {
      morning: patch(slots.morning ?? []),
      afternoon: patch(slots.afternoon ?? []),
      evening: patch(slots.evening ?? []),
    },
  };
}
