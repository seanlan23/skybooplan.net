export type OpenInGoogleMapsResult =
  | { ok: true }
  | { ok: false; reason: "invalid_coords" | "no_window" };

export type GoogleMapsNavOptions = {
  /** Display/query hint (reserved); directions use lat/lng for reliable deep links. */
  label?: string;
  originLat?: number;
  originLng?: number;
  /** Place names (e.g. "Rassada Pier, Phuket") — better ferry lines than bare coords. */
  originQuery?: string;
  destinationQuery?: string;
  /** Default driving so intercity vans don't open as flights from "Your location". */
  travelMode?: "driving" | "walking" | "transit" | "bicycling";
};

/** Validates WGS84 coords suitable for Google Maps deep links. */
export function isValidNavCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Google Maps Directions deep link.
 * Always sets travelmode (default driving). When origin is provided (transfer leg),
 * Maps routes from→to instead of "Your location" → flight across the globe.
 */
export function buildGoogleMapsDirectionsUrl(
  lat: number,
  lng: number,
  opts?: GoogleMapsNavOptions,
): string {
  const travelmode = opts?.travelMode ?? "driving";
  const destination =
    opts?.destinationQuery?.trim() || `${lat},${lng}`;
  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode,
  });

  const originQuery = opts?.originQuery?.trim();
  if (originQuery) {
    params.set("origin", originQuery);
  } else if (
    opts?.originLat != null &&
    opts?.originLng != null &&
    isValidNavCoord(opts.originLat, opts.originLng)
  ) {
    params.set("origin", `${opts.originLat},${opts.originLng}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Multi-stop road-trip URL for Google Maps (origin → waypoints → destination).
 * Uses path form: /maps/dir/A/B/C — works well for motorhome day cities.
 */
export function buildGoogleMapsRoadTripUrl(stops: string[]): string {
  const parts = stops
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
  if (parts.length < 2) return "https://www.google.com/maps/";
  // Cap waypoints — Google Maps URL length / UX.
  const capped = parts.length > 10 ? [parts[0]!, ...parts.slice(1, -1).slice(0, 8), parts[parts.length - 1]!] : parts;
  return `https://www.google.com/maps/dir/${capped.map(encodeURIComponent).join("/")}`;
}

/** Apple Maps driving directions (origin + destination; limited waypoint support). */
export function buildAppleMapsRoadTripUrl(origin: string, destination: string): string {
  const params = new URLSearchParams({
    dirflg: "d",
    saddr: origin.trim(),
    daddr: destination.trim(),
  });
  return `https://maps.apple.com/?${params.toString()}`;
}

/**
 * Opens Google Maps directions to `destination` in a new tab.
 */
export function openInGoogleMaps(
  lat: number,
  lng: number,
  labelOrOpts?: string | GoogleMapsNavOptions,
): OpenInGoogleMapsResult {
  if (!isValidNavCoord(lat, lng)) {
    return { ok: false, reason: "invalid_coords" };
  }
  if (typeof window === "undefined") {
    return { ok: false, reason: "no_window" };
  }

  const opts: GoogleMapsNavOptions =
    typeof labelOrOpts === "string" ? { label: labelOrOpts } : (labelOrOpts ?? {});

  const url = buildGoogleMapsDirectionsUrl(lat, lng, opts);
  window.open(url, "_blank", "noopener,noreferrer");
  return { ok: true };
}

export const NAV_ERROR_MESSAGES = {
  invalid_coords: "Koordinate za navigacijo niso na voljo.",
  no_window: "Navigacija ni na voljo v tem okolju.",
} as const;
