/**
 * Single source of truth for the itinerary map.
 * One day → one city center → few pins → optional inbound leg.
 * Map renderer must not re-resolve coordinates.
 */
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  defaultCampgroundNearCity,
  resolveCampgroundCoords,
} from "@/lib/campgroundCoords";
import { DESTINATION_BY_IATA } from "@/lib/destinationCoords";
import { haversineKm } from "@/lib/geoMath";
import {
  normalizeMapPoiCategory,
  resolveMapPoiCategory,
  type MapPoiCategory,
} from "@/lib/mapPoiCategory";
import { isCampActivityName } from "@/lib/motorhomeRoute";
import { lookupRegionCoords } from "@/lib/regionCoords";

export const MAX_DAY_PINS = 4;
/** Allow day-trips (e.g. Blue Mountains from Sydney, Sintra from Lisbon). */
export const MAX_PIN_FROM_CENTER_KM = 120;
export const COLOCATE_KM = 1.2;
export const DAY_VIEW_ZOOM = 11.2;
export const PLAY_VIEW_ZOOM = 11.2;
/**
 * Beyond this, use flyTo (zoom-out → zoom-in) instead of pan-at-city-zoom.
 * Covers regional hops (BKK→CNX ~680 km), not only ocean long-hauls.
 */
export const FLY_CAMERA_KM = 220;
/** Ocean / intercontinental — slower flyTo curve. */
export const LONG_HAUL_CAMERA_KM = 800;
export const CAMERA_MS_LOCAL = 2800;
export const MIN_ROUTE_DRAW_KM = 40;
const AIRPORT_SNAP_KM = 12;

/** Duration for a camera move — regional+ hops use flyTo (zoom-out arc). */
export function cameraMoveDurationMs(distKm: number): number {
  if (!Number.isFinite(distKm) || distKm < FLY_CAMERA_KM) return CAMERA_MS_LOCAL;
  if (distKm < LONG_HAUL_CAMERA_KM) {
    // Regional (BKK→CNX): ~3.5–5.2s smooth zoom-out/in
    return Math.min(5200, Math.max(3400, Math.round(2800 + distKm * 2.5)));
  }
  return Math.min(9000, Math.max(5000, Math.round(distKm * 0.4)));
}

/** True when the renderer should flyTo (zoom-out arc) rather than easeTo. */
export function isLongHaulCameraMove(distKm: number): boolean {
  return Number.isFinite(distKm) && distKm >= FLY_CAMERA_KM;
}

export function flyCameraCurve(distKm: number): number {
  if (distKm >= LONG_HAUL_CAMERA_KM) return 1.65;
  // Regional city hop — clear zoom-out then settle on day city
  return 1.45;
}

function pinCategoryFamily(cat: MapPoiCategory): "transit" | "food" | "stay" | "sight" {
  if (cat === "airport" || cat === "train" || cat === "ferry" || cat === "transport") {
    return "transit";
  }
  if (cat === "food") return "food";
  if (cat === "hotel") return "stay";
  return "sight";
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

/** Home-airport rows prepended on same-day arrival (Arrive at MUC / Check-in / International flight). */
export function dayHasOriginDepartureLogistics(day: DayPlan): boolean {
  const acts = [
    ...(day.activities?.morning ?? []),
    ...(day.activities?.afternoon ?? []),
    ...(day.activities?.evening ?? []),
  ];
  return acts.some((a) => {
    const name = a.name ?? "";
    return (
      /^(odhod|departure|abflug|partenza|salida)\s*:/i.test(name) ||
      /^départ\s*:/i.test(name) ||
      /^(prihod na letališče|arrive at .+ airport|ankunft am flughafen)/i.test(name) ||
      /\b(international flight|mednarodni let)\s*\([A-Z]{3}\)/i.test(name) ||
      /check-in (in varnostni|and security|und sicherheits|e controlli|y seguridad)/i.test(name)
    );
  });
}

/** Origin city center for map camera — regionCoords only, never IATA runway. */
function resolveOriginDepartureCenter(plan: AiTripPlan): { label: string; center: LngLat } | null {
  const iata = plan.originIata?.trim().toUpperCase();
  if (!iata) return null;
  const hub = DESTINATION_BY_IATA[iata];
  if (!hub?.name) return null;
  const city = lookupRegionCoords(hub.name);
  if (!city) return null;
  return { label: hub.name, center: city };
}

/**
 * Road-trip / motorhome start: prefer originPlace city center (e.g. Slovenj Gradec),
 * then fall back to origin IATA hub city. Never runway coords.
 */
export function resolveTripOriginCenter(
  plan: AiTripPlan,
): { label: string; center: LngLat } | null {
  const place = plan.originPlace?.trim();
  if (place) {
    const center = lookupRegionCoords(place);
    if (center) {
      const label =
        place
          .split(",")[0]
          ?.trim()
          .replace(/\s+(SI|AT|DE|IT|HR|NL|IT)\b/i, "")
          .trim() || place;
      return { label, center };
    }
  }
  return resolveOriginDepartureCenter(plan);
}

/** Motorhome / car plans draw drive legs between city hops (even without flight-day titles). */
export function isGroundRoadTrip(plan: AiTripPlan): boolean {
  return (
    plan.groundTransportMode === "motorhome" ||
    plan.groundTransportMode === "car" ||
    plan.accommodationMode === "motorhome"
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

function pushPinCandidate(
  pins: MapDayPin[],
  day: DayPlan,
  center: LngLat,
  city: string,
  travel: boolean,
  candidate: {
    name: string;
    lat: number;
    lng: number;
    category?: string;
    description?: string;
    arrivalTime?: string;
    departureTime?: string;
    estimatedCostEur?: number;
    imageUrl?: string;
  },
): void {
  if (!isValidMapCoord(candidate.lat, candidate.lng)) return;
  const category = normalizeMapPoiCategory(candidate.category);
  if (!travel && (category === "airport" || isLogisticsName(candidate.name))) return;
  // Only drop runway snaps for airport-category pins — small islands (e.g. Santorini/Oia)
  // sit within AIRPORT_SNAP_KM of JTR and must still show sightseeing pins.
  if (
    !travel &&
    category === "airport" &&
    isAirportRunwayCoord({ lat: candidate.lat, lng: candidate.lng })
  ) {
    return;
  }
  if (haversineKm([center.lng, center.lat], [candidate.lng, candidate.lat]) > MAX_PIN_FROM_CENTER_KM) {
    return;
  }
  const n = candidate.name.trim().toLowerCase();
  if (!n || n === city.toLowerCase()) return;

  const nameKey = fuzzyNameKey(candidate.name);
  const imageUrl =
    candidate.imageUrl?.trim() || activityImageByName(day, candidate.name) || undefined;
  const family = pinCategoryFamily(category);
  const existing = pins.find((p) => {
    const sameName = nameKey.length >= 5 && fuzzyNameKey(p.name) === nameKey;
    const sameSpot =
      haversineKm([p.lng, p.lat], [candidate.lng, candidate.lat]) < COLOCATE_KM;
    if (sameName) return true;
    // Same coords alone is not enough — don't glue train + dinner into one pin.
    return sameSpot && pinCategoryFamily(p.category) === family;
  });
  if (existing) {
    if (candidate.name.trim().length > existing.name.trim().length) {
      existing.name = candidate.name;
      existing.category = category;
      existing.description = candidate.description ?? existing.description;
    }
    if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
    return;
  }
  if (pins.length >= MAX_DAY_PINS) return;

  let lat = candidate.lat;
  let lng = candidate.lng;
  const crowded = pins.find(
    (p) => haversineKm([p.lng, p.lat], [lng, lat]) < COLOCATE_KM,
  );
  if (crowded) {
    const angle = ((pins.length + 1) * 2.4) % (Math.PI * 2);
    const radiusKm = 0.85 + (pins.length % 3) * 0.35;
    lat = crowded.lat + (radiusKm / 111) * Math.cos(angle);
    lng =
      crowded.lng +
      (radiusKm / (111 * Math.max(0.2, Math.cos((crowded.lat * Math.PI) / 180)))) *
        Math.sin(angle);
  }

  pins.push({
    id: `pin-${day.day}-${pins.length}-${nameKey || "x"}`,
    name: candidate.name,
    lat,
    lng,
    category,
    description: candidate.description,
    arrivalTime: candidate.arrivalTime,
    departureTime: candidate.departureTime,
    estimatedCostEur: candidate.estimatedCostEur,
    imageUrl,
  });
}

function collectPins(
  day: DayPlan,
  center: LngLat,
  opts?: { seedCampHub?: boolean },
): MapDayPin[] {
  const travel = isTravelDay(day);
  const city = normalizeCityLabel(day.city);
  const pins: MapDayPin[] = [];

  for (const pin of day.mapPins ?? []) {
    pushPinCandidate(pins, day, center, city, travel, pin);
  }

  // Always backfill from activities — Gemini often returns 0–1 mapPins while
  // activities already carry usable coords (or we fan out near city center).
  if (day.activities && pins.length < MAX_DAY_PINS) {
    const acts = [
      ...(day.activities.morning ?? []),
      ...(day.activities.afternoon ?? []),
      ...(day.activities.evening ?? []),
    ];
    // Prefer campgrounds first on motorhome nights so they land in the pin budget.
    const ranked = [...acts].sort((a, b) => {
      const aCamp = /\b(kamp|avtokamp|campground|campsite|camping|rv\s*park)\b/i.test(
        `${a.name} ${a.description ?? ""}`,
      )
        ? 0
        : 1;
      const bCamp = /\b(kamp|avtokamp|campground|campsite|camping|rv\s*park)\b/i.test(
        `${b.name} ${b.description ?? ""}`,
      )
        ? 0
        : 1;
      return aCamp - bCamp;
    });
    let fanIndex = 0;
    for (const act of ranked) {
      if (pins.length >= MAX_DAY_PINS) break;
      if (isLogisticsName(act.name)) continue;
      let lat = act.lat;
      let lng = act.lng;
      let pinName = act.name;
      if (!isValidMapCoord(lat, lng)) {
        const looksCamp = isCampActivityName(act.name, act.description ?? "");
        const campHit = looksCamp
          ? resolveCampgroundCoords(city || day.focusName, act.name) ??
            (() => {
              const d = defaultCampgroundNearCity(city || day.focusName);
              return d
                ? { lat: d.lat, lng: d.lng, matchedName: d.name }
                : null;
            })()
          : null;
        if (campHit) {
          lat = campHit.lat;
          lng = campHit.lng;
          if (/^(kamp|camp|camping|avtokamp)\b/i.test(pinName.trim())) {
            pinName = campHit.matchedName;
          }
        } else {
          // Spread nameless/coord-less POIs around the city so the map isn't empty.
          const angle = (fanIndex * 2.4) % (Math.PI * 2);
          const radiusKm = 1.2 + (fanIndex % 3) * 0.9;
          const dLat = (radiusKm / 111) * Math.cos(angle);
          const dLng =
            (radiusKm / (111 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)))) *
            Math.sin(angle);
          lat = center.lat + dLat;
          lng = center.lng + dLng;
          fanIndex += 1;
        }
      }
      const category = resolveMapPoiCategory({
        name: pinName,
        description: act.description,
        type: act.type,
        pinCategory: act.type,
      });
      pushPinCandidate(pins, day, center, city, travel, {
        name: pinName,
        lat: lat!,
        lng: lng!,
        category,
        description: act.description,
        arrivalTime: act.arrivalTime,
        departureTime: act.departureTime,
        estimatedCostEur: act.estimatedCostEur,
        imageUrl: act.imageUrl,
      });
    }
  }

  // Motorhome nights with no camp activity — drop curated camp hub pin.
  if (
    opts?.seedCampHub &&
    pins.length < MAX_DAY_PINS &&
    !pins.some((p) => isCampActivityName(p.name)) &&
    !day.inFlightDay
  ) {
    const hub = defaultCampgroundNearCity(city || day.focusName);
    if (hub) {
      pushPinCandidate(pins, day, center, city, travel, {
        name: hub.name,
        lat: hub.lat,
        lng: hub.lng,
        category: "hotel",
      });
    }
  }

  // Arrival / soft days often only have logistics text — still show a city pin.
  if (pins.length === 0 && city && !day.inFlightDay) {
    pins.push({
      id: `pin-${day.day}-city-hub`,
      name: `Središče — ${city}`,
      lat: center.lat,
      lng: center.lng,
      category: "sightseeing",
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
  const destCenter = resolveCityCenter(day);
  const roadTrip = isGroundRoadTrip(plan);
  // Motorhome day 1: camera on originPlace (SG), not first overnight (Salzburg).
  const roadOrigin =
    roadTrip && activeDay === 1 ? resolveTripOriginCenter(plan) : null;
  const flightOrigin = dayHasOriginDepartureLogistics(day)
    ? resolveOriginDepartureCenter(plan)
    : null;
  const originDep = roadOrigin ?? flightOrigin;
  // Same-day arrival lists MUC first while day.city is already Toronto — camera
  // must match the home-airport cards the user is reading (city center, not runway).
  // Road-trip day 1: same rule from originPlace → first overnight city.
  const useOriginCamera = Boolean(
    originDep &&
      destCenter &&
      haversineKm(
        [originDep.center.lng, originDep.center.lat],
        [destCenter.lng, destCenter.lat],
      ) >= MIN_ROUTE_DRAW_KM,
  );
  const center = useOriginCamera ? originDep!.center : destCenter;
  if (!center) return null;

  const cityLabel = useOriginCamera
    ? originDep!.label
    : normalizeCityLabel(day.city) ||
      normalizeCityLabel(day.focusName) ||
      `Day ${day.day}`;

  const pins = useOriginCamera
    ? [
        {
          id: `pin-${day.day}-origin-hub`,
          name: originDep!.label,
          lat: originDep!.center.lat,
          lng: originDep!.center.lng,
          category: "sightseeing" as const,
        },
      ]
    : collectPins(day, center, {
        seedCampHub: roadTrip || plan.accommodationMode === "motorhome",
      });

  let legIn: MapDayLeg | undefined;
  if (useOriginCamera && destCenter) {
    legIn = {
      mode: roadTrip ? "drive" : "flight",
      from: originDep!.center,
      to: destCenter,
    };
  } else {
    const prev = plan.days.find((d) => d.day === activeDay - 1);
    const prevCenter = prev ? resolveCityCenter(prev) : null;
    if (prevCenter) {
      const dist = haversineKm(
        [prevCenter.lng, prevCenter.lat],
        [center.lng, center.lat],
      );
      const roadHop = roadTrip && dist >= MIN_ROUTE_DRAW_KM;
      if ((isTravelDay(day) || roadHop) && dist >= MIN_ROUTE_DRAW_KM) {
        legIn = {
          mode: roadHop && !isTravelDay(day) ? "drive" : inferLegMode(day, dist),
          from: prevCenter,
          to: center,
        };
      }
    }
  }

  return { day: activeDay, cityLabel, center, pins, legIn };
}

/**
 * Muted full-route segments for motorhome/car (city → city).
 * Camera stays day-owned — TripMap paints these as overview only (no fitBounds).
 */
export function buildMotorhomeOverviewLegs(plan: AiTripPlan): MapDayLeg[] {
  if (!isGroundRoadTrip(plan)) return [];

  const centers: LngLat[] = [];
  // Include true start (originPlace) before first overnight city.
  const origin = resolveTripOriginCenter(plan);
  if (origin) centers.push(origin.center);
  for (const day of plan.days ?? []) {
    if (day.inFlightDay) continue;
    const c = resolveCityCenter(day);
    if (!c) continue;
    const last = centers[centers.length - 1];
    if (last && haversineKm([last.lng, last.lat], [c.lng, c.lat]) < 8) continue;
    centers.push(c);
  }

  const legs: MapDayLeg[] = [];
  for (let i = 1; i < centers.length; i++) {
    const from = centers[i - 1]!;
    const to = centers[i]!;
    const dist = haversineKm([from.lng, from.lat], [to.lng, to.lat]);
    if (dist < MIN_ROUTE_DRAW_KM) continue;
    legs.push({ mode: "drive", from, to });
  }
  return legs;
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
