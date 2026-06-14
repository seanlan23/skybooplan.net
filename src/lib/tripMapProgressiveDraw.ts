import type { DayPlan } from "@/lib/aiPlan.functions";
import {
  buildDayWaypointCoords,
  buildGreatCircleCoords,
  fetchDrivingRouteWithWaypoints,
  type RouteMode,
  type TripRouteSegment,
  haversineKm,
} from "@/lib/tripMapRoutes";
import type { RouteDayStop } from "@/lib/tripMapRouteState";

export const ROUTE_DRAW_DURATION_MS = 2000;

/** Max km for Mapbox driving Directions — longer legs are drawn as great-circle flights. */
const MAX_DRIVING_DIRECTIONS_KM = 900;

const MODE_PRIORITY: RouteMode[] = ["flight", "ferry", "driving", "transit"];

export type ActiveDayLineStyle = RouteMode;

export type ActiveDayRoute = {
  coordinates: [number, number][];
  lineStyle: ActiveDayLineStyle;
  /** All geographic points for fitBounds (stops + route). */
  boundsPoints: [number, number][];
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

function appendUniqueWaypoint(
  list: [number, number][],
  seen: Set<string>,
  coord: [number, number],
) {
  const key = `${coord[0].toFixed(5)},${coord[1].toFixed(5)}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push(coord);
}

/** Ordered stops for the active day — previous anchor, POIs/activities, day destination. */
export function buildActiveDayWaypoints(
  activeDay: number,
  dayPlan: DayPlan | undefined,
  dayCoords: Map<number, [number, number]>,
  origin: [number, number] | null,
  finalizedDays: RouteDayStop[],
): [number, number][] {
  const waypoints: [number, number][] = [];
  const seen = new Set<string>();
  const endpoints = resolveDayRouteEndpoints(activeDay, dayCoords, origin, finalizedDays);
  const dayCoord =
    dayCoords.get(activeDay) ??
    finalizedDays.find((d) => d.day.day === activeDay)?.coord ??
    null;

  if (endpoints) appendUniqueWaypoint(waypoints, seen, endpoints.from);

  if (dayPlan) {
    for (const c of buildDayWaypointCoords(dayPlan, dayCoord)) {
      appendUniqueWaypoint(waypoints, seen, c);
    }
  } else if (dayCoord) {
    appendUniqueWaypoint(waypoints, seen, dayCoord);
  }

  if (endpoints) appendUniqueWaypoint(waypoints, seen, endpoints.to);

  return waypoints;
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

function shouldSkipDrivingDirections(
  daySegments: TripRouteSegment[],
  endpoints: { from: [number, number]; to: [number, number] } | null,
): boolean {
  if (daySegments.some((s) => s.mode === "flight" || s.mode === "ferry")) return true;
  if (!endpoints) return false;
  return haversineKm(endpoints.from, endpoints.to) > MAX_DRIVING_DIRECTIONS_KM;
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

/** Resolve route geometry — Mapbox driving for ground legs; great-circle for flights/ferries. */
export async function resolveActiveDayRoute(opts: {
  activeDay: number;
  dayPlan?: DayPlan;
  routeData: TripRouteSegment[];
  dayCoords: Map<number, [number, number]>;
  origin: [number, number] | null;
  finalizedDays: RouteDayStop[];
  token: string | null;
}): Promise<ActiveDayRoute> {
  const { activeDay, dayPlan, routeData, dayCoords, origin, finalizedDays, token } = opts;
  const waypoints = buildActiveDayWaypoints(
    activeDay,
    dayPlan,
    dayCoords,
    origin,
    finalizedDays,
  );
  const daySegments = segmentsForDay(routeData, activeDay);
  const primarySeg = pickPrimarySegment(daySegments);
  const endpoints = resolveDayRouteEndpoints(activeDay, dayCoords, origin, finalizedDays);
  const allSegmentCoords = daySegments.flatMap((s) => s.coordinates);

  // Flight / ferry — use precomputed great-circle arcs (never Mapbox driving).
  if (primarySeg && (primarySeg.mode === "flight" || primarySeg.mode === "ferry")) {
    const coordinates = enrichSegmentCoords(primarySeg);
    return {
      coordinates,
      lineStyle: primarySeg.mode,
      boundsPoints: mergeBoundsPoints(waypoints, coordinates, allSegmentCoords),
    };
  }

  // Driving / transit polyline already resolved (e.g. Mapbox Directions at plan load).
  if (primarySeg && primarySeg.coordinates.length > 2) {
    return {
      coordinates: primarySeg.coordinates,
      lineStyle: primarySeg.mode,
      boundsPoints: mergeBoundsPoints(waypoints, primarySeg.coordinates, allSegmentCoords),
    };
  }

  // Long intercontinental hop without cached segment — draw as flight arc.
  if (endpoints && haversineKm(endpoints.from, endpoints.to) > MAX_DRIVING_DIRECTIONS_KM) {
    const arc = greatCircleForMode(endpoints.from, endpoints.to, "flight");
    return {
      coordinates: arc,
      lineStyle: "flight",
      boundsPoints: mergeBoundsPoints(waypoints, arc),
    };
  }

  // Ground leg — Mapbox Directions with all day waypoints.
  if (waypoints.length >= 2 && token && !shouldSkipDrivingDirections(daySegments, endpoints)) {
    const route = await fetchDrivingRouteWithWaypoints(waypoints, token);
    if (route.fromMapboxDirections && route.coordinates.length >= 2) {
      return {
        coordinates: route.coordinates,
        lineStyle: "driving",
        boundsPoints: mergeBoundsPoints(waypoints, route.coordinates),
      };
    }

    if (endpoints) {
      const arc = greatCircleForMode(endpoints.from, endpoints.to, "ferry");
      return {
        coordinates: arc,
        lineStyle: "ferry",
        boundsPoints: mergeBoundsPoints(waypoints, arc),
      };
    }
  }

  if (endpoints) {
    const distKm = haversineKm(endpoints.from, endpoints.to);
    const mode: RouteMode = distKm > MAX_DRIVING_DIRECTIONS_KM ? "flight" : "ferry";
    const arc = greatCircleForMode(endpoints.from, endpoints.to, mode);
    return {
      coordinates: arc,
      lineStyle: mode,
      boundsPoints: mergeBoundsPoints(waypoints, arc),
    };
  }

  if (primarySeg && primarySeg.coordinates.length >= 2) {
    const coordinates = enrichSegmentCoords(primarySeg);
    return {
      coordinates,
      lineStyle: primarySeg.mode,
      boundsPoints: mergeBoundsPoints(waypoints, coordinates, allSegmentCoords),
    };
  }

  return {
    coordinates: [],
    lineStyle: "driving",
    boundsPoints: waypoints,
  };
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
}): Promise<[number, number][]> {
  const route = await resolveActiveDayRoute(opts);
  return route.coordinates;
}

export function coordsBoundsKey(coords: [number, number][]): string {
  if (coords.length === 0) return "";
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  return `${coords.length}:${first[0].toFixed(4)},${first[1].toFixed(4)}:${last[0].toFixed(4)},${last[1].toFixed(4)}`;
}
