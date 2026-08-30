/**
 * Rough overnight stay estimates (EUR) — shown separately from the daily plan total.
 * Hotel = mid 3★ double room (often with breakfast); camp = EU pitch + per-person fees.
 * Country bands are a floor. Famous expensive cities override — NYC is not “generic US”.
 */

import { inclusiveCalendarDayCount } from "@/lib/dateUtils";

/** Mid double-room nightly EUR for hubs where the country average is far too cheap. */
const CITY_HOTEL_NIGHTLY: Array<{ test: RegExp; eur: number }> = [
  { test: /new york|\bnyc\b|manhattan|brooklyn|williamsburg/, eur: 270 },
  { test: /san francisco/, eur: 250 },
  { test: /\bboston\b/, eur: 230 },
  { test: /los angeles/, eur: 210 },
  { test: /\bmiami\b/, eur: 210 },
  { test: /washington/, eur: 210 },
  { test: /\bseattle\b/, eur: 200 },
  { test: /\bchicago\b/, eur: 190 },
  { test: /las vegas/, eur: 160 },
  { test: /\blondon\b/, eur: 220 },
  { test: /\bparis\b/, eur: 200 },
  { test: /amsterdam/, eur: 190 },
  { test: /zurich|zürich|geneva|genève/, eur: 230 },
  { test: /\boslo\b/, eur: 200 },
  { test: /reykjav/, eur: 210 },
  { test: /\btokyo\b/, eur: 160 },
  { test: /singapore/, eur: 170 },
  { test: /\bdubai\b/, eur: 160 },
  { test: /\bsydney\b/, eur: 190 },
  { test: /hong kong/, eur: 180 },
  { test: /\bvenice\b|venezia/, eur: 190 },
  { test: /\brome\b|\broma\b/, eur: 170 },
  { test: /barcelona/, eur: 160 },
  { test: /copenhagen|københavn/, eur: 190 },
];

const IATA_HOTEL_NIGHTLY: Record<string, number> = {
  JFK: 270,
  EWR: 270,
  LGA: 270,
  SFO: 250,
  BOS: 230,
  LAX: 210,
  MIA: 210,
  DCA: 210,
  IAD: 210,
  SEA: 200,
  ORD: 190,
  MDW: 190,
  LAS: 160,
  LHR: 220,
  LGW: 220,
  LCY: 220,
  STN: 220,
  CDG: 200,
  ORY: 200,
  AMS: 190,
  ZRH: 230,
  GVA: 230,
  OSL: 200,
  KEF: 210,
  NRT: 160,
  HND: 160,
  SIN: 170,
  DXB: 160,
  SYD: 190,
  HKG: 180,
  VCE: 190,
  FCO: 170,
  BCN: 160,
  CPH: 190,
};

export function estimateHotelCityNightlyEur(place?: string, iata?: string): number | null {
  const code = (iata ?? "").trim().toUpperCase();
  if (code && IATA_HOTEL_NIGHTLY[code] != null) return IATA_HOTEL_NIGHTLY[code];
  const n = (place ?? "").trim().toLowerCase();
  if (!n) return null;
  for (const row of CITY_HOTEL_NIGHTLY) {
    if (row.test.test(n)) return row.eur;
  }
  return null;
}

const ASIA_HOTEL = new Set([
  "TH",
  "VN",
  "ID",
  "MY",
  "PH",
  "KH",
  "LA",
  "LK",
  "IN",
  "NP",
  "MM",
  "BD",
  "CN",
  "TW",
  "KR",
  "JP",
]);

/** Adriatic / Alps tourist belt — ~€100/room/night. */
const ADRIATIC_ALPS_HOTEL = new Set([
  "HR",
  "SI",
  "AT",
  "ME",
  "AL",
  "BA",
  "RS",
  "XK",
  "MK",
  "HU",
]);

const WEST_EU_HOTEL = new Set([
  "IT",
  "ES",
  "FR",
  "PT",
  "GR",
  "DE",
  "NL",
  "BE",
  "IE",
  "GB",
]);

const PREMIUM_HOTEL = new Set(["CH", "NO", "DK", "SE", "FI", "IS", "LU"]);

/** Fly-and-flop island nations — mid resort room, not a city 3★. */
const ISLAND_RESORT_HOTEL = new Set(["MV", "SC", "MU"]);

export type OvernightStayKind = "hotel" | "camp" | "none";

export type OvernightEstimate = {
  kind: OvernightStayKind;
  /** Room (hotel) or pitch+people (camp) per night. */
  nightlyEur: number;
  nights: number;
  rooms: number;
  totalEur: number;
};

/** Mid double-room nightly EUR by city, then country (2 guests, often with breakfast). */
export function estimateHotelRoomNightlyEur(
  countryCode?: string,
  opts?: { place?: string; iata?: string },
): number {
  const city = estimateHotelCityNightlyEur(opts?.place, opts?.iata);
  if (city != null) return city;
  const cc = (countryCode ?? "").trim().toUpperCase();
  if (!cc || cc === "XX") return 80;
  if (ASIA_HOTEL.has(cc)) {
    // JP/KR/CN sit higher than SE Asia mid band.
    if (cc === "JP" || cc === "KR" || cc === "CN" || cc === "TW") return 95;
    return 55;
  }
  if (ADRIATIC_ALPS_HOTEL.has(cc)) return 100;
  if (ISLAND_RESORT_HOTEL.has(cc)) return 240;
  if (PREMIUM_HOTEL.has(cc)) return 160;
  if (WEST_EU_HOTEL.has(cc)) return 120;
  if (cc === "US" || cc === "CA" || cc === "AU" || cc === "NZ") return 140;
  if (cc === "AE" || cc === "SG") return 130;
  return 80;
}

/** EU-style campsite: pitch + per-person fees for the household. */
export function estimateCampNightlyEur(countryCode: string | undefined, pax: number): number {
  const p = Math.max(1, pax);
  const cc = (countryCode ?? "").trim().toUpperCase();
  const pitch = ASIA_HOTEL.has(cc) ? 18 : PREMIUM_HOTEL.has(cc) ? 36 : 28;
  const perPerson = ASIA_HOTEL.has(cc) ? 5 : 8;
  return Math.min(75, Math.max(30, pitch + perPerson * p));
}

export function tripOvernightNights(dayCount: number): number {
  return Math.max(0, Math.floor(dayCount) - 1);
}

/** Hotel nights from `hotels[]` or check-in/out — not from a synthetic 1-day plan. */
export function resolveStayNights(opts: {
  hotelNights?: number | null;
  fromDate?: string | null;
  toDate?: string | null;
}): number | undefined {
  if (typeof opts.hotelNights === "number" && opts.hotelNights > 0) {
    return Math.floor(opts.hotelNights);
  }
  const from = opts.fromDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const to = opts.toDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!from || !to) return undefined;
  const days = inclusiveCalendarDayCount(from, to);
  if (!days) return undefined;
  return Math.max(1, days - 1);
}

/** Join destination + all day cities so day-1 origin (Munich) cannot hide NYC. */
export function overnightPlaceHint(opts: {
  destinationName?: string | null;
  destinationPlace?: string | null;
  destinationIata?: string | null;
  dayCities?: Array<string | undefined | null>;
}): string {
  return [
    opts.destinationName,
    opts.destinationPlace,
    opts.destinationIata,
    ...(opts.dayCities ?? []),
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Separate overnight line for the UI.
 * Motorhome: camp share stays inside the daily plan — no separate overnight row.
 * Hotel / car road-trip: rough hotel room × rooms × nights.
 */
export function estimateOvernightStay(opts: {
  dayCount: number;
  pax: number;
  countryCode?: string;
  place?: string;
  iata?: string;
  mode: "hotel" | "car" | "motorhome";
  /** Nights at home / origin on a car loop — do not bill a hotel. */
  unpaidNights?: number;
  /** When set, used instead of `dayCount - 1` (single-base synthetic days). */
  nights?: number;
}): OvernightEstimate {
  const rawNights =
    opts.nights != null ? Math.floor(opts.nights) : tripOvernightNights(opts.dayCount);
  const nights = Math.max(0, rawNights - Math.max(0, opts.unpaidNights ?? 0));
  if (nights <= 0 || opts.mode === "motorhome") {
    return { kind: "none", nightlyEur: 0, nights: 0, rooms: 0, totalEur: 0 };
  }

  const rooms = Math.max(1, Math.ceil(Math.max(1, opts.pax) / 2));
  const nightlyEur = estimateHotelRoomNightlyEur(opts.countryCode, {
    place: opts.place,
    iata: opts.iata,
  });
  return {
    kind: "hotel",
    nightlyEur,
    nights,
    rooms,
    totalEur: Math.round(nightlyEur * rooms * nights),
  };
}
