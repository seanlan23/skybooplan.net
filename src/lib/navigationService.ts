export type OpenInGoogleMapsResult =
  | { ok: true }
  | { ok: false; reason: "invalid_coords" | "no_window" };

/** Validates WGS84 coords suitable for Google Maps deep links. */
export function isValidNavCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Stateless Google Maps Directions deep link (no KML/GPX). */
export function buildGoogleMapsDirectionsUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${lat},${lng}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Opens Google Maps directions to `destination` in a new tab.
 * @param label Reserved for future place-name queries; coords-only link per spec.
 */
export function openInGoogleMaps(
  lat: number,
  lng: number,
  _label?: string,
): OpenInGoogleMapsResult {
  if (!isValidNavCoord(lat, lng)) {
    return { ok: false, reason: "invalid_coords" };
  }
  if (typeof window === "undefined") {
    return { ok: false, reason: "no_window" };
  }

  const url = buildGoogleMapsDirectionsUrl(lat, lng);
  window.open(url, "_blank", "noopener,noreferrer");
  return { ok: true };
}

export const NAV_ERROR_MESSAGES = {
  invalid_coords: "Koordinate za navigacijo niso na voljo.",
  no_window: "Navigacija ni na voljo v tem okolju.",
} as const;
