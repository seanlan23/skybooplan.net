import {
  fetchDrivingRoute,
  type TripRouteSegment,
  haversineKm,
} from "@/lib/tripMapRoutes";
import type { RouteDayStop } from "@/lib/tripMapRouteState";

export const ROUTE_DRAW_DURATION_MS = 2000;

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

/** Fetch Mapbox driving geometry when cache only has a straight segment or nothing yet. */
export async function resolveActiveDayRouteCoords(opts: {
  activeDay: number;
  routeData: TripRouteSegment[];
  dayCoords: Map<number, [number, number]>;
  origin: [number, number] | null;
  finalizedDays: RouteDayStop[];
  token: string | null;
}): Promise<[number, number][]> {
  const { activeDay, routeData, dayCoords, origin, finalizedDays, token } = opts;
  const seg = routeData.find((s) => s.dayTo === activeDay);
  if (seg && seg.coordinates.length > 2) return seg.coordinates;

  const endpoints = resolveDayRouteEndpoints(activeDay, dayCoords, origin, finalizedDays);
  if (!endpoints) {
    return seg?.coordinates.length ? seg.coordinates : [];
  }

  const { from, to } = endpoints;
  if (token) {
    try {
      const route = await fetchDrivingRoute(from, to, token);
      if (route.coordinates.length >= 2) return route.coordinates;
    } catch (err) {
      console.warn("[tripMap] Active-day Directions fallback:", err);
    }
  }

  if (seg && seg.coordinates.length >= 2) return seg.coordinates;
  return [from, to];
}

export function coordsBoundsKey(coords: [number, number][]): string {
  if (coords.length === 0) return "";
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  return `${coords.length}:${first[0].toFixed(4)},${first[1].toFixed(4)}:${last[0].toFixed(4)},${last[1].toFixed(4)}`;
}
