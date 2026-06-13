import type { TripRouteSegment } from "@/lib/tripMapRoutes";
import { haversineKm } from "@/lib/tripMapRoutes";
import type { RouteDayStop } from "@/lib/tripMapRouteState";

export const ROUTE_DRAW_DURATION_MS = 1750;

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

/** Coordinates for the leg ending on `activeDay` (Mapbox driving polyline or fallback). */
export function resolveSegmentCoordsForDay(
  routeData: TripRouteSegment[],
  activeDay: number,
  dayCoords: Map<number, [number, number]>,
  origin: [number, number] | null,
  finalizedDays: RouteDayStop[],
): [number, number][] {
  const seg = routeData.find((s) => s.dayTo === activeDay);
  if (seg && seg.coordinates.length >= 2) return seg.coordinates;

  const curr = dayCoords.get(activeDay);
  const prev =
    dayCoords.get(activeDay - 1) ??
    finalizedDays.find((d) => d.day.day === activeDay - 1)?.coord ??
    (activeDay === 1 ? origin : null);

  if (prev && curr && (prev[0] !== curr[0] || prev[1] !== curr[1])) {
    return [prev, curr];
  }
  return [];
}
