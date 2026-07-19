import { lookupRegionCoords } from "@/lib/regionCoords";

export type PlaceNavTarget = {
  lat: number;
  lng: number;
  /** Google Maps place query — draws a real route/ferry line better than bare coords. */
  query: string;
};

/** Known piers / jetties — ferry Navigiraj should land here, not city centroids in the sea. */
const PLACE_COORDS: Array<{ test: RegExp; lat: number; lng: number; query: string }> = [
  {
    test: /rassada|rasada|phuket.*pier|pier.*phuket/i,
    lat: 7.8955,
    lng: 98.4015,
    query: "Rassada Pier, Phuket, Thailand",
  },
  {
    test: /ton\s*sai|tonsai|phi\s*phi.*pier|pier.*phi\s*phi|koh\s*phi\s*phi|phi\s*phi/i,
    lat: 7.7405,
    lng: 98.7782,
    query: "Tonsai Pier, Koh Phi Phi, Thailand",
  },
  {
    test: /ao nang.*pier|pier.*ao nang|noppharat.*pier/i,
    lat: 8.0345,
    lng: 98.8235,
    query: "Ao Nang Pier, Krabi, Thailand",
  },
  {
    test: /patong/i,
    lat: 7.896,
    lng: 98.296,
    query: "Patong Beach, Phuket, Thailand",
  },
];

const FERRY_PHUKET: PlaceNavTarget = {
  lat: 7.8955,
  lng: 98.4015,
  query: "Rassada Pier, Phuket, Thailand",
};

const FERRY_PHI_PHI: PlaceNavTarget = {
  lat: 7.7405,
  lng: 98.7782,
  query: "Tonsai Pier, Koh Phi Phi, Thailand",
};

/** Resolve ferry/van endpoints like "Phuket (Rassada …)" → pier coords + Maps query. */
export function lookupPlaceNavTarget(
  place: string,
  opts?: { ferry?: boolean },
): PlaceNavTarget | null {
  const raw = place.trim();
  if (!raw) return null;

  for (const entry of PLACE_COORDS) {
    if (entry.test.test(raw)) {
      return { lat: entry.lat, lng: entry.lng, query: entry.query };
    }
  }

  // Ferry legs without "Rassada" in the label still need the pier, not town center.
  if (opts?.ferry) {
    if (/\bphuket\b/i.test(raw)) return FERRY_PHUKET;
    if (/phi\s*phi|koh\s*phi/i.test(raw)) return FERRY_PHI_PHI;
  }

  const region = lookupRegionCoords(raw);
  if (region) {
    return {
      lat: region.lat,
      lng: region.lng,
      query: `${raw.replace(/\s+/g, " ").trim()}, Thailand`,
    };
  }
  return null;
}
