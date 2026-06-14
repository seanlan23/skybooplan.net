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

export const ROUTE_DRAW_DURATION_MS = 2000;

/** Min distance (km) before we draw a driving line on road-trip plans. */
export const MIN_ROAD_TRIP_DRAW_KM = 30;

/** Max km for Mapbox driving Directions — longer legs are drawn as great-circle flights. */
const MAX_DRIVING_DIRECTIONS_KM = 900;

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
  const to =
    dayCoords.get(activeDay) ??
    finalizedDays.find((d) => d.day.day === activeDay)?.coord ??
    null;
  if (!to) return null;

  const from =
    dayCoords.get(activeDay - 1) ??
    finalizedDays.find((d) => d.day.day === activeDay - 1)?.coord ??
    (activeDay === 1 ? origin : null);
  if (!from) return null;
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

/** POI / activity coords for fitBounds on sightseeing days (no road line). */
export function buildPoiBoundsPoints(
  dayPlan: DayPlan | undefined,
  dayCoord: [number, number] | null,
): [number, number][] {
  if (!dayPlan && !dayCoord) return [];
  const coords = dayPlan ? buildDayWaypointCoords(dayPlan, dayCoord) : [];
  if (coords.length === 0 && dayCoord) return [dayCoord];
  return coords;
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

function greatCircleForMode(
  from: [number, number],
  to: [number, number],
  mode: RouteMode,
): [number, number][] {
  const npoints = mode === "flight" ? 128 : mode === "ferry" ? 96 : 80;
  return buildGreatCircleCoords(from, to, npoints);
}

/** Driving lines only on road-trip plans for inter-city legs above MIN_ROAD_TRIP_DRAW_KM. */
export function shouldDrawDrivingRoute(
  preferDriving: boolean,
  endpoints: { from: [number, number]; to: [number, number] } | null,
  primarySeg: TripRouteSegment | null,
): boolean {
  if (!preferDriving || !endpoints) return false;
  if (primarySeg?.mode === "flight" || primarySeg?.mode === "ferry") return false;
  return haversineKm(endpoints.from, endpoints.to) >= MIN_ROAD_TRIP_DRAW_KM;
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
  endpoints: { from: [number, number]; to: [number, number] } | null,
): ActiveDayRoute {
  const poiBounds = buildPoiBoundsPoints(dayPlan, dayCoord);
  const boundsPoints = endpoints
    ? mergeBoundsPoints(poiBounds, [endpoints.from, endpoints.to])
    : poiBounds;
  return {
    coordinates: [],
    lineStyle: "driving",
    boundsPoints,
    drawRoute: false,
  };
}

/** Resolve route geometry — driving lines only on road-trip inter-city legs. */
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

  // Flight / ferry — always show great-circle arc.
  if (primarySeg && (primarySeg.mode === "flight" || primarySeg.mode === "ferry")) {
    const coordinates = enrichSegmentCoords(primarySeg);
    return {
      coordinates,
      lineStyle: primarySeg.mode,
      boundsPoints: mergeBoundsPoints(poiBounds, coordinates, allSegmentCoords),
      drawRoute: true,
    };
  }

  // Long intercontinental hop — flight arc.
  if (endpoints && haversineKm(endpoints.from, endpoints.to) > MAX_DRIVING_DIRECTIONS_KM) {
    const arc = greatCircleForMode(endpoints.from, endpoints.to, "flight");
    return {
      coordinates: arc,
      lineStyle: "flight",
      boundsPoints: mergeBoundsPoints(poiBounds, arc),
      drawRoute: true,
    };
  }

  const drawDriving = shouldDrawDrivingRoute(preferDriving, endpoints, primarySeg);

  // Road-trip inter-city leg — Mapbox driving between previous stop and today's city (2 points).
  if (drawDriving && endpoints) {
    if (primarySeg?.mode === "driving" && primarySeg.coordinates.length > 2) {
      return {
        coordinates: primarySeg.coordinates,
        lineStyle: "driving",
        boundsPoints: mergeBoundsPoints(poiBounds, primarySeg.coordinates),
        drawRoute: true,
      };
    }

    if (token) {
      const route = await fetchDrivingRoute(endpoints.from, endpoints.to, token);
      if (route.fromMapboxDirections && route.coordinates.length >= 2) {
        return {
          coordinates: route.coordinates,
          lineStyle: "driving",
          boundsPoints: mergeBoundsPoints(poiBounds, route.coordinates),
          drawRoute: true,
        };
      }
    }

    if (primarySeg && primarySeg.coordinates.length >= 2) {
      const coordinates = enrichSegmentCoords(primarySeg);
      return {
        coordinates,
        lineStyle: primarySeg.mode,
        boundsPoints: mergeBoundsPoints(poiBounds, coordinates),
        drawRoute: true,
      };
    }
  }

  // Sightseeing / same-city day / non-road-trip — markers + bounds, no road line.
  return sightseeingRoute(dayPlan, dayCoord, endpoints);
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

/** @deprecated Use buildPoiBoundsPoints */
export function buildActiveDayWaypoints(
  activeDay: number,
  dayPlan: DayPlan | undefined,
  dayCoords: Map<number, [number, number]>,
  origin: [number, number] | null,
  finalizedDays: RouteDayStop[],
): [number, number][] {
  const endpoints = resolveDayRouteEndpoints(activeDay, dayCoords, origin, finalizedDays);
  const dayCoord =
    dayCoords.get(activeDay) ??
    finalizedDays.find((d) => d.day.day === activeDay)?.coord ??
    null;
  const poiBounds = buildPoiBoundsPoints(dayPlan, dayCoord);
  return endpoints
    ? mergeBoundsPoints(poiBounds, [endpoints.from, endpoints.to])
    : poiBounds;
}
