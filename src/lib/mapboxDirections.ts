import { HTTP_API_TIMEOUT_MS, withTimeout } from "@/lib/asyncTimeout";
import { haversineKm } from "@/lib/geoMath";

const DIRECTIONS_TIMEOUT_MS = Math.min(HTTP_API_TIMEOUT_MS, 15_000);

export type DirectionsResult = {
  coordinates: [number, number][];
  fromMapbox: boolean;
};

/**
 * Thin Mapbox Directions client for drive/ferry legs.
 * On failure returns a straight fallback (caller may swap to great-circle).
 */
export async function fetchDrivingDirections(
  from: [number, number],
  to: [number, number],
  token: string,
): Promise<DirectionsResult> {
  const straight: DirectionsResult = {
    coordinates: [from, to],
    fromMapbox: false,
  };
  if (haversineKm(from, to) < 0.05) return straight;

  const waypointStr = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${waypointStr}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(token)}`;

  try {
    const data = await withTimeout(
      (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Mapbox Directions ${res.status}`);
        return res.json() as Promise<{
          routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
        }>;
      })(),
      DIRECTIONS_TIMEOUT_MS,
      "mapbox:driving",
    );
    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    if (coordinates && coordinates.length >= 2) {
      return { coordinates, fromMapbox: true };
    }
  } catch (err) {
    console.warn("[mapboxDirections] fallback straight line:", err);
  }
  return straight;
}
