import type { DayPlan } from "@/lib/aiPlan.functions";
import {
  buildDayWaypointCoords,
  buildGreatCircleCoords,
  fetchDrivingRoute,
  type RouteMode,
  type TripRouteSegment,
  haversineKm,
} from "@/lib/tripMapRoutes";
import type { RouteDayStop } from "@/lib/tripMapRouteState";
import { lookupRegionCoords } from "@/lib/regionCoords";
import { lookupPoiCoords } from "@/lib/tripGeo";

export const ROUTE_DRAW_DURATION_MS = 2000;

/** Min distance (km) before we draw a driving line on road-trip plans. */
export const MIN_ROAD_TRIP_DRAW_KM = 30;

/** Max km for Mapbox driving Directions — longer legs are drawn as great-circle flights. */
const MAX_DRIVING_DIRECTIONS_KM = 900;

/**
 * Camera fitBounds stays local to the active day.
 * Route lines may still span continents; the viewport must not.
 */
export const MAX_DAY_CAMERA_SPAN_KM = 450;

const MODE_PRIORITY: RouteMode[] = ["flight", "ferry", "driving", "transit"];

export type ActiveDayLineStyle = RouteMode;

export type ActiveDayRoute = {
  coordinates: [number, number][];
  lineStyle: ActiveDayLineStyle;
  /** All geographic points for fitBounds (stops + route). */
  boundsPoints: [number, number][];
  /** Whether a route line should be animated (false = markers + bounds only). */
  drawRoute: boolean;
};

/** Closest-vertex progress along a polyline (0 = start, 1 = end). */
export function progressAlongRoute(
  coords: [number, number][],
  point: [number, number],
): number {
  if (coords.length < 2) return 1;
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineKm(coords[i]!, point);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx / (coords.length - 1);
}

export function resolveDayRouteEndpoints(
  activeDay: number,
  dayCoords: Map<number, [number, number]>,
  origin: [number, number] | null,
  finalizedDays: RouteDayStop[],
): { from: [number, number]; to: [number, number] } | null {
  const toDay = finalizedDays.find((d) => d.day.day === activeDay);
  const fromDay = finalizedDays.find((d) => d.day.day === activeDay - 1);

  const rawTo =
    dayCoords.get(activeDay) ?? toDay?.coord ?? null;
  if (!rawTo) return null;

  const rawFrom =
    dayCoords.get(activeDay - 1) ??
    fromDay?.coord ??
    (activeDay === 1 ? origin : null);
  if (!rawFrom) return null;

  const to = lngLatFromCity(toDay?.day.city) ?? rawTo;
  const from = lngLatFromCity(fromDay?.day.city) ?? rawFrom;
  if (from[0] === to[0] && from[1] === to[1]) return null;

  return { from, to };
}

function mergeBoundsPoints(...groups: [number, number][][]): [number, number][] {
  const out: [number, number][] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const c of group) {
      const key = `${c[0].toFixed(5)},${c[1].toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

/** Keep only points within MAX_DAY_CAMERA_SPAN_KM of the day center (or all if no center). */
export function filterBoundsNearDay(
  dayCoord: [number, number] | null,
  groups: [number, number][][],
  maxKm = MAX_DAY_CAMERA_SPAN_KM,
): [number, number][] {
  if (!dayCoord) return mergeBoundsPoints(...groups);
  const filtered = groups.map((group) =>
    group.filter((c) => haversineKm(dayCoord, c) <= maxKm),
  );
  return mergeBoundsPoints(...filtered);
}

/** POI / activity coords for fitBounds on sightseeing days (no road line). */
export function buildPoiBoundsPoints(
  dayPlan: DayPlan | undefined,
  dayCoord: [number, number] | null,
): [number, number][] {
  if (!dayPlan && !dayCoord) return [];
  const coords = dayPlan ? buildDayWaypointCoords(dayPlan, dayCoord) : [];
  const local = dayCoord
    ? coords.filter((c) => haversineKm(dayCoord, c) <= MAX_DAY_CAMERA_SPAN_KM)
    : coords;
  if (local.length === 0 && dayCoord) return [dayCoord];
  return local;
}

export function segmentsForDay(
  routeData: TripRouteSegment[],
  activeDay: number,
): TripRouteSegment[] {
  return routeData.filter((s) => s.dayTo === activeDay);
}

export function pickPrimarySegment(segments: TripRouteSegment[]): TripRouteSegment | null {
  for (const mode of MODE_PRIORITY) {
    const match = segments.find((s) => s.mode === mode && s.coordinates.length >= 2);
    if (match) return match;
  }
  return segments.find((s) => s.coordinates.length >= 2) ?? null;
}

/** Rich great-circle geometry for flight/ferry when cache is sparse. */
export function enrichSegmentCoords(seg: TripRouteSegment): [number, number][] {
  if (seg.mode === "flight" || seg.mode === "ferry") {
    if (seg.coordinates.length >= 16) return seg.coordinates;
    return buildGreatCircleCoords(
      seg.from,
      seg.to,
      seg.mode === "flight" ? 128 : 96,
    );
  }
  return seg.coordinates;
}

function lngLatFromCity(city?: string): [number, number] | null {
  if (!city?.trim()) return null;
  const c = lookupRegionCoords(city) ?? lookupPoiCoords(city);
  return c ? [c.lng, c.lat] : null;
}

function prevCityName(activeDay: number, finalizedDays: RouteDayStop[]): string | undefined {
  const idx = finalizedDays.findIndex((d) => d.day.day === activeDay);
  if (idx <= 0) return undefined;
  return finalizedDays[idx - 1]?.day.city;
}

/**
 * Mapbox Directions from land-snapped city centers when raw endpoints sit in water/jungle
 * (Cheow Lan lake centroid → no roads → straight-line fallback).
 */
export async function fetchDrivingRouteLandAware(
  from: [number, number],
  to: [number, number],
  token: string,
  cities?: { fromCity?: string; toCity?: string },
): Promise<{ coordinates: [number, number][]; fromMapboxDirections: boolean }> {
  const primary = await fetchDrivingRoute(from, to, token);
  if (primary.fromMapboxDirections) {
    return { coordinates: primary.coordinates, fromMapboxDirections: true };
  }

  const fromLand = lngLatFromCity(cities?.fromCity) ?? from;
  const toLand = lngLatFromCity(cities?.toCity) ?? to;
  if (fromLand[0] === from[0] && fromLand[1] === from[1] && toLand[0] === to[0] && toLand[1] === to[1]) {
    return { coordinates: primary.coordinates, fromMapboxDirections: false };
  }

  const retry = await fetchDrivingRoute(fromLand, toLand, token);
  if (retry.fromMapboxDirections) {
    return { coordinates: retry.coordinates, fromMapboxDirections: true };
  }
  return { coordinates: primary.coordinates, fromMapboxDirections: false };
}

function greatCircleForMode(
  from: [number, number],
  to: [number, number],
  mode: RouteMode,
): [number, number][] {
  const npoints = mode === "flight" ? 128 : mode === "ferry" ? 96 : 80;
  return buildGreatCircleCoords(from, to, npoints);
}

/**
 * When to draw a road/transit line for the active day.
 * - Explicit driving/transit segment (van, kombi, city change) → always, if leg is real.
 * - Road-trip mode → inter-city legs above MIN_ROAD_TRIP_DRAW_KM.
 * Sightseeing / same-city days stay marker-only.
 */
export function shouldDrawDrivingRoute(
  preferDriving: boolean,
  endpoints: { from: [number, number]; to: [number, number] } | null,
  primarySeg: TripRouteSegment | null,
): boolean {
  if (!endpoints) return false;
  if (primarySeg?.mode === "flight" || primarySeg?.mode === "ferry") return false;

  const distKm = haversineKm(endpoints.from, endpoints.to);
  // Inter-city van/kombi/bus from buildSegmentSpecs — draw even on flight+hotel trips.
  if (primarySeg?.mode === "driving" || primarySeg?.mode === "transit") {
    return distKm >= 0.3;
  }
  if (!preferDriving) return false;
  return distKm >= MIN_ROAD_TRIP_DRAW_KM;
}

/** Coordinates for the leg ending on `activeDay` (cached Directions polyline or fallback). */
export function resolveSegmentCoordsForDay(
  routeData: TripRouteSegment[],
  activeDay: number,
  dayCoords: Map<number, [number, number]>,
  origin: [number, number] | null,
  finalizedDays: RouteDayStop[],
): [number, number][] {
  const primary = pickPrimarySegment(segmentsForDay(routeData, activeDay));
  if (primary) return enrichSegmentCoords(primary);

  const endpoints = resolveDayRouteEndpoints(activeDay, dayCoords, origin, finalizedDays);
  if (endpoints) return [endpoints.from, endpoints.to];
  return [];
}

function sightseeingRoute(
  dayPlan: DayPlan | undefined,
  dayCoord: [number, number] | null,
): ActiveDayRoute {
  // Markers only — never pull previous-day / origin endpoints into the camera.
  return {
    coordinates: [],
    lineStyle: "driving",
    boundsPoints: buildPoiBoundsPoints(dayPlan, dayCoord),
    drawRoute: false,
  };
}

function dayLooksLikeFlightDay(dayPlan?: DayPlan): boolean {
  if (!dayPlan) return false;
  if (dayPlan.inFlightDay) return true;
  if ((dayPlan.transportation ?? []).some((t) => t.type === "flight")) return true;
  const blob = `${dayPlan.title} ${dayPlan.morning} ${dayPlan.afternoon} ${dayPlan.evening}`;
  return /letalo|flight|airport|odlet|prilet|check-in|letališč/i.test(blob);
}

function dayHasGroundTransfer(dayPlan?: DayPlan): boolean {
  if (!dayPlan) return false;
  if (
    (dayPlan.transportation ?? []).some((t) =>
      t.type === "van" || t.type === "bus" || t.type === "train",
    )
  ) {
    return true;
  }
  const blob = `${dayPlan.title} ${dayPlan.morning} ${dayPlan.afternoon} ${dayPlan.evening}`;
  return /kombi|minibus|van\b|transfer|prevoz|vožnja|drive to|bus to/i.test(blob);
}

/** Resolve route geometry for the active day (flight arc, road polyline, or markers only). */
export async function resolveActiveDayRoute(opts: {
  activeDay: number;
  dayPlan?: DayPlan;
  routeData: TripRouteSegment[];
  dayCoords: Map<number, [number, number]>;
  origin: [number, number] | null;
  finalizedDays: RouteDayStop[];
  token: string | null;
  preferDriving: boolean;
}): Promise<ActiveDayRoute> {
  const {
    activeDay,
    dayPlan,
    routeData,
    dayCoords,
    origin,
    finalizedDays,
    token,
    preferDriving,
  } = opts;

  const dayCoord =
    dayCoords.get(activeDay) ??
    finalizedDays.find((d) => d.day.day === activeDay)?.coord ??
    null;
  const daySegments = segmentsForDay(routeData, activeDay);
  const primarySeg = pickPrimarySegment(daySegments);
  const endpoints = resolveDayRouteEndpoints(activeDay, dayCoords, origin, finalizedDays);
  const poiBounds = buildPoiBoundsPoints(dayPlan, dayCoord);
  const allSegmentCoords = daySegments.flatMap((s) => s.coordinates);

  // Flight / ferry — draw full arc, but camera stays on the active-day side.
  if (primarySeg && (primarySeg.mode === "flight" || primarySeg.mode === "ferry")) {
    const coordinates = enrichSegmentCoords(primarySeg);
    return {
      coordinates,
      lineStyle: primarySeg.mode,
      boundsPoints: filterBoundsNearDay(dayCoord, [
        poiBounds,
        [primarySeg.to],
        [primarySeg.from],
        coordinates,
        allSegmentCoords,
      ]),
      drawRoute: true,
    };
  }

  // Long intercontinental hop — only on real flight/arrival days (not sightseeing).
  if (
    endpoints &&
    haversineKm(endpoints.from, endpoints.to) > MAX_DRIVING_DIRECTIONS_KM &&
    dayLooksLikeFlightDay(dayPlan)
  ) {
    const arc = greatCircleForMode(endpoints.from, endpoints.to, "flight");
    return {
      coordinates: arc,
      lineStyle: "flight",
      boundsPoints: filterBoundsNearDay(dayCoord, [poiBounds, [endpoints.to], [endpoints.from], arc]),
      drawRoute: true,
    };
  }

  const drawDriving =
    shouldDrawDrivingRoute(preferDriving, endpoints, primarySeg) ||
    Boolean(
      endpoints &&
        dayHasGroundTransfer(dayPlan) &&
        haversineKm(endpoints.from, endpoints.to) >= MIN_ROAD_TRIP_DRAW_KM,
    );

  // Inter-city ground leg (kombi/van) or road-trip — Mapbox driving polyline.
  if (drawDriving && endpoints) {
    const lineStyle: ActiveDayLineStyle =
      primarySeg?.mode === "transit" ? "transit" : "driving";

    // Prefer cached Mapbox geometry (many points). Skip 2-point straight stubs.
    if (
      primarySeg?.mode === "driving" &&
      primarySeg.coordinates.length > 8
    ) {
      return {
        coordinates: primarySeg.coordinates,
        lineStyle: "driving",
        boundsPoints: filterBoundsNearDay(dayCoord, [
          poiBounds,
          primarySeg.coordinates,
          [endpoints.from, endpoints.to],
        ]),
        drawRoute: true,
      };
    }

    if (token) {
      const road = await fetchDrivingRouteLandAware(
        endpoints.from,
        endpoints.to,
        token,
        {
          fromCity: prevCityName(activeDay, finalizedDays),
          toCity: dayPlan?.city,
        },
      );
      if (road.fromMapboxDirections && road.coordinates.length >= 2) {
        return {
          coordinates: road.coordinates,
          lineStyle,
          boundsPoints: filterBoundsNearDay(dayCoord, [
            poiBounds,
            road.coordinates,
            [endpoints.from, endpoints.to],
          ]),
          drawRoute: true,
        };
      }
    }

    if (primarySeg && primarySeg.mode === "driving" && primarySeg.coordinates.length > 8) {
      return {
        coordinates: primarySeg.coordinates,
        lineStyle: "driving",
        boundsPoints: filterBoundsNearDay(dayCoord, [
          poiBounds,
          primarySeg.coordinates,
          [endpoints.from, endpoints.to],
        ]),
        drawRoute: true,
      };
    }

    // Last resort — straight line (visible but not snapped).
    return {
      coordinates: [endpoints.from, endpoints.to],
      lineStyle: "driving",
      boundsPoints: filterBoundsNearDay(dayCoord, [
        poiBounds,
        [endpoints.from, endpoints.to],
      ]),
      drawRoute: true,
    };
  }

  // Sightseeing / same-city day — markers + bounds, no road line.
  return sightseeingRoute(dayPlan, dayCoord);
}

/** @deprecated Use resolveActiveDayRoute — kept for tests. */
export async function resolveActiveDayRouteCoords(opts: {
  activeDay: number;
  routeData: TripRouteSegment[];
  dayCoords: Map<number, [number, number]>;
  origin: [number, number] | null;
  finalizedDays: RouteDayStop[];
  token: string | null;
  dayPlan?: DayPlan;
  preferDriving?: boolean;
}): Promise<[number, number][]> {
  const route = await resolveActiveDayRoute({
    ...opts,
    preferDriving: opts.preferDriving ?? false,
  });
  return route.coordinates;
}

export function coordsBoundsKey(coords: [number, number][]): string {
  if (coords.length === 0) return "";
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  return `${coords.length}:${first[0].toFixed(4)},${first[1].toFixed(4)}:${last[0].toFixed(4)},${last[1].toFixed(4)}`;
}

/** @deprecated Use buildPoiBoundsPoints — local day bounds only (no intercontinental stretch). */
export function buildActiveDayWaypoints(
  activeDay: number,
  dayPlan: DayPlan | undefined,
  dayCoords: Map<number, [number, number]>,
  _origin: [number, number] | null,
  finalizedDays: RouteDayStop[],
): [number, number][] {
  const dayCoord =
    dayCoords.get(activeDay) ??
    finalizedDays.find((d) => d.day.day === activeDay)?.coord ??
    null;
  return buildPoiBoundsPoints(dayPlan, dayCoord);
}
