import { lookupDestination } from "@/lib/destinationCoords";

/** Default CE/SI cluster when geo is unknown or outside mapped countries. */
export const DEFAULT_ORIGIN_IATAS = ["LJU", "VIE", "ZAG", "MXP", "BUD", "MUC"] as const;

/**
 * Country ISO2 (from Vercel/CF IP geo) → primary departure hubs shown in the picker.
 * Order is a sensible default; lat/lng can re-rank when available.
 */
export const ORIGIN_IATAS_BY_COUNTRY: Record<string, string[]> = {
  SI: ["LJU", "VIE", "ZAG", "TRS", "MUC", "VCE"],
  HR: ["ZAG", "SPU", "DBV", "LJU", "VIE", "TRS"],
  AT: ["VIE", "SZG", "INN", "GRZ", "MUC", "LJU"],
  DE: ["MUC", "FRA", "HAM", "BER", "DUS", "CGN"],
  CH: ["ZRH", "GVA", "BSL", "MUC", "FRA", "MXP"],
  IT: ["MXP", "FCO", "VCE", "BGY", "TRS", "NAP"],
  FR: ["CDG", "ORY", "NCE", "LYS", "MRS", "TLS"],
  GB: ["LHR", "LGW", "MAN", "EDI", "BHX", "STN"],
  IE: ["DUB", "ORK", "SNN", "LHR", "LGW", "MAN"],
  NL: ["AMS", "RTM", "EIN", "BRU", "DUS", "CGN"],
  BE: ["BRU", "CRL", "AMS", "CDG", "DUS", "CGN"],
  ES: ["MAD", "BCN", "AGP", "PMI", "ALC", "VLC"],
  PT: ["LIS", "OPO", "FAO", "MAD", "BCN", "CDG"],
  CZ: ["PRG", "BRQ", "VIE", "MUC", "BER", "BUD"],
  HU: ["BUD", "VIE", "LJU", "ZAG", "MUC", "PRG"],
  SK: ["BTS", "VIE", "BUD", "PRG", "KRK", "MUC"],
  PL: ["WAW", "KRK", "GDN", "WRO", "BER", "VIE"],
  SE: ["ARN", "GOT", "CPH", "OSL", "HAM", "BER"],
  NO: ["OSL", "BGO", "TRF", "ARN", "CPH", "AMS"],
  DK: ["CPH", "BLL", "AAL", "HAM", "ARN", "OSL"],
  FI: ["HEL", "TMP", "TKU", "ARN", "RIX", "TLL"],
  GR: ["ATH", "SKG", "HER", "RHO", "CFU", "FCO"],
  TR: ["IST", "SAW", "AYT", "ESB", "ADB", "ATH"],
  US: ["JFK", "EWR", "ORD", "LAX", "SFO", "MIA"],
  CA: ["YYZ", "YVR", "YUL", "YYC", "JFK", "ORD"],
  AU: ["SYD", "MEL", "BNE", "PER", "ADL", "AKL"],
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Re-rank hub IATAs by distance to approximate IP lat/lng when known. */
export function rankOriginIatasByDistance(
  iatas: string[],
  lat: number,
  lng: number,
): string[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return iatas;
  return [...iatas]
    .map((iata) => {
      const meta = lookupDestination(iata);
      const dist =
        meta != null ? haversineKm(lat, lng, meta.lat, meta.lng) : Number.POSITIVE_INFINITY;
      return { iata, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .map((x) => x.iata);
}

export function resolveOriginHubsForGeo(opts: {
  country?: string | null;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
}): string[] {
  const limit = opts.limit ?? 6;
  const cc = (opts.country ?? "").trim().toUpperCase();
  const base = (cc && ORIGIN_IATAS_BY_COUNTRY[cc]
    ? ORIGIN_IATAS_BY_COUNTRY[cc]
    : [...DEFAULT_ORIGIN_IATAS]
  ).slice(0, Math.max(limit, 6));

  const lat = opts.lat ?? NaN;
  const lng = opts.lng ?? NaN;
  const ranked =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? rankOriginIatasByDistance(base, lat, lng)
      : base;

  // Fill to `limit` from default CE hubs if country list was short / missing codes.
  const out: string[] = [];
  const seen = new Set<string>();
  for (const code of [...ranked, ...DEFAULT_ORIGIN_IATAS]) {
    const iata = code.toUpperCase();
    if (!/^[A-Z]{3}$/.test(iata) || seen.has(iata)) continue;
    seen.add(iata);
    out.push(iata);
    if (out.length >= limit) break;
  }
  return out;
}
