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
