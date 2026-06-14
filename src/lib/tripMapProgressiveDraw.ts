import type { DayPlan } from "@/lib/aiPlan.functions";
import {
  buildDayWaypointCoords,
  buildGreatCircleCoords,
  fetchDrivingRouteWithWaypoints,
  type TripRouteSegment,
  haversineKm,
} from "@/lib/tripMapRoutes";
import type { RouteDayStop } from "@/lib/tripMapRouteState";

export const ROUTE_DRAW_DURATION_MS = 2000;

export type ActiveDayLineStyle = "driving" | "ferry";

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

function ferryArcFallback(from: [number, number], to: [number, number]): [number, number][] {
  return buildGreatCircleCoords(from, to, 96);
}

/** Coordinates for the leg ending on `activeDay` (cached Directions polyline or fallback). */
export function resolveSegmentCoordsForDay(
  routeData: TripRouteSegment[],
  activeDay: number,
  dayCoords: Map<number, [number, number]>,
  origin: [number, number] | null,
  finalizedDays: RouteDayStop[],
): [number, number][] {
  const seg = routeData.find((s) => s.dayTo === activeDay);
  if (seg && seg.coordinates.length >= 2) return seg.coordinates;

  const endpoints = resolveDayRouteEndpoints(activeDay, dayCoords, origin, finalizedDays);
  if (endpoints) return [endpoints.from, endpoints.to];
  return [];
}

/** Resolve driving geometry via Mapbox Directions (multi-waypoint) or ferry arc fallback. */
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
  const seg = routeData.find((s) => s.dayTo === activeDay);
  const endpoints = resolveDayRouteEndpoints(activeDay, dayCoords, origin, finalizedDays);

  if (seg && seg.coordinates.length > 2) {
    const lineStyle: ActiveDayLineStyle = seg.mode === "ferry" ? "ferry" : "driving";
    return {
      coordinates: seg.coordinates,
      lineStyle,
      boundsPoints: mergeBoundsPoints(waypoints, seg.coordinates),
    };
  }

  if (waypoints.length >= 2 && token) {
    const route = await fetchDrivingRouteWithWaypoints(waypoints, token);
    if (route.fromMapboxDirections && route.coordinates.length >= 2) {
      return {
        coordinates: route.coordinates,
        lineStyle: "driving",
        boundsPoints: mergeBoundsPoints(waypoints, route.coordinates),
      };
    }

    const from = waypoints[0]!;
    const to = waypoints[waypoints.length - 1]!;
    const arc = ferryArcFallback(from, to);
    return {
      coordinates: arc,
      lineStyle: "ferry",
      boundsPoints: mergeBoundsPoints(waypoints, arc),
    };
  }

  if (endpoints) {
    const arc = ferryArcFallback(endpoints.from, endpoints.to);
    return {
      coordinates: arc,
      lineStyle: "ferry",
      boundsPoints: mergeBoundsPoints(waypoints, arc),
    };
  }

  if (seg && seg.coordinates.length >= 2) {
    return {
      coordinates: seg.coordinates,
      lineStyle: seg.mode === "ferry" ? "ferry" : "driving",
      boundsPoints: mergeBoundsPoints(waypoints, seg.coordinates),
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
