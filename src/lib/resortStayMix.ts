import { lookupDestination } from "@/lib/destinationCoords";
import { haversineKm } from "@/lib/geoMath";
import { perNightPrice } from "@/lib/hotelResults";

/** Country-level resort card mix — same table pattern as STAY_COUNTRIES / COASTAL_ROWS. */
export type ResortStayMixRow = {
  countries: string[];
  iatas?: string[];
  /** City / airport-island labels. Must not match “North Malé Atoll”. */
  excludePlace: RegExp;
  excludeCityExact: RegExp;
  excludeNear?: Array<{ lat: number; lng: number; radiusKm: number }>;
  /** Soft preference for mid-tier island names; live Booking still wins. */
  valueNeedles: string[];
  valueNightlyEur: { min: number; max: number };
  skipForValue: RegExp;
  overwater: RegExp;
  valueSlots: number;
  allInclusiveSlots: number;
  boutiqueSlots?: number;
  premiumSlots: number;
  /** Official star floor (default 3). Maldives islands use 4. */
  minStars?: number;
};

export type ResortStayPlace = {
  name?: string;
  neighborhood?: string;
  lat?: number;
  lng?: number;
};

const RESORT_STAY_MIX: ResortStayMixRow[] = [
  {
    countries: ["MV"],
    iatas: ["MLE"],
    excludePlace:
      /\b(hulhumal[eé]|hulhul[eé]|velana)\b|\bmal[eé](?:\s+city|\s+town)\b|\b(?:hotel|inn|city).{0,24}mal[eé]\b/i,
    excludeCityExact: /^(mal[eé]|mal[eé],\s*maldives)$/i,
    excludeNear: [
      { lat: 4.1755, lng: 73.5093, radiusKm: 2.5 },
      { lat: 4.211, lng: 73.541, radiusKm: 4 },
    ],
    valueNeedles: ["malahini", "kuda bandos", "bandos", "fihalhohi", "adaaran", "rannalhi"],
    valueNightlyEur: { min: 150, max: 250 },
    skipForValue:
      /\b(hyatt|park hyatt|andaz|ritz[- ]?carlton|four seasons|st\.?\s*regis|waldorf|raffles|aman\b|one\s*&?\s*only)\b/i,
    overwater: /\bover[- ]?water|water villas?|water bungalows?|nad vodo\b/i,
    valueSlots: 2,
    allInclusiveSlots: 2,
    boutiqueSlots: 1,
    premiumSlots: 1,
    minStars: 4,
  },
];

export function matchResortStayMix(opts?: {
  countryCode?: string;
  destIata?: string;
}): ResortStayMixRow | null {
  const cc = (opts?.countryCode ?? "").trim().toUpperCase();
  const iata = (opts?.destIata ?? "").trim().toUpperCase();
  const fromIata = iata ? lookupDestination(iata)?.country : "";
  return (
    RESORT_STAY_MIX.find(
      (row) =>
        (cc && row.countries.includes(cc)) ||
        (fromIata && row.countries.includes(fromIata)) ||
        (iata && row.iatas?.includes(iata)),
    ) ?? null
  );
}

export function stayPlaceBlob(hotel: ResortStayPlace): string {
  return [hotel.name, hotel.neighborhood].filter(Boolean).join(" ");
}

export function isExcludedResortLocation(hotel: ResortStayPlace, row: ResortStayMixRow): boolean {
  const neighborhood = String(hotel.neighborhood ?? "").trim();
  if (neighborhood && row.excludeCityExact.test(neighborhood)) return true;
  if (row.excludePlace.test(stayPlaceBlob(hotel))) return true;
  const lat = hotel.lat;
  const lng = hotel.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (row.excludeNear ?? []).some(
    (point) => haversineKm([lng as number, lat as number], [point.lng, point.lat]) <= point.radiusKm,
  );
}

export function isOverwaterStay(hotel: ResortStayPlace, row: ResortStayMixRow): boolean {
  return row.overwater.test(stayPlaceBlob(hotel));
}

export function matchesValueNeedle(hotel: ResortStayPlace, row: ResortStayMixRow): boolean {
  const blob = stayPlaceBlob(hotel).toLowerCase();
  return row.valueNeedles.some((needle) => blob.includes(needle));
}

export function stayNightlyEur(stayTotal: number, nights: number): number {
  return perNightPrice(stayTotal, Math.max(1, nights));
}

export function inValueNightlyBand(stayTotal: number, nights: number, row: ResortStayMixRow): boolean {
  const nightly = stayNightlyEur(stayTotal, nights);
  return nightly >= row.valueNightlyEur.min && nightly <= row.valueNightlyEur.max;
}
