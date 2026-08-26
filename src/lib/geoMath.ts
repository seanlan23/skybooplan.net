import greatCircle from "@turf/great-circle";
import { point } from "@turf/helpers";

/** Distance in km between two [lng, lat] points. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Typical road km ≈ 1.2× great-circle. */
const ROAD_KM_FACTOR = 1.2;

/**
 * Gemini / Mapbox sometimes store metres in a km field (65 km → 65000)
 * or invent a continent-scale hop (Cancun→Playa as 4093). Prefer geography.
 */
export function normalizeStatedRoadKm(statedKm: number, geoKm: number): number {
  const geo = Number.isFinite(geoKm) ? Math.max(0, geoKm) : 0;
  const stated = Number.isFinite(statedKm) ? Math.max(0, statedKm) : 0;
  if (geo < 2) return stated > 120 ? 0 : Math.round(stated);
  const road = geo * ROAD_KM_FACTOR;
  if (stated >= 800) {
    const asKm = stated / 1000;
    if (asKm >= geo * 0.35 && asKm <= geo * 3.5) return Math.round(asKm);
  }
  if (stated < road * 0.75 || stated > road * 2.2) {
    return Math.round(road);
  }
  return Math.round(stated);
}

/** Flight / long-hop arc as [lng, lat][]. */
export function buildGreatCircleCoords(
  from: [number, number],
  to: [number, number],
  npoints = 128,
): [number, number][] {
  try {
    const line = greatCircle(point(from), point(to), { npoints });
    const geom = line.geometry;
    if (geom.type === "LineString") {
      return geom.coordinates as [number, number][];
    }
    if (geom.type === "MultiLineString") {
      return geom.coordinates.flat() as [number, number][];
    }
  } catch {
    /* fall through */
  }
  return [from, to];
}
