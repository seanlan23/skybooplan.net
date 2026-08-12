/**
 * Rough overnight stay estimates (EUR) — shown separately from the daily plan total.
 * Hotel = room for ~2 with breakfast band; camp = EU pitch + per-person fees.
 */

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

export type OvernightStayKind = "hotel" | "camp" | "none";

export type OvernightEstimate = {
  kind: OvernightStayKind;
  /** Room (hotel) or pitch+people (camp) per night. */
  nightlyEur: number;
  nights: number;
  rooms: number;
  totalEur: number;
};

/** Mid double-room nightly EUR by country (2 guests, often with breakfast). */
export function estimateHotelRoomNightlyEur(countryCode?: string): number {
  const cc = (countryCode ?? "").trim().toUpperCase();
  if (!cc || cc === "XX") return 80;
  if (ASIA_HOTEL.has(cc)) {
    // JP/KR/CN sit higher than SE Asia mid band.
    if (cc === "JP" || cc === "KR" || cc === "CN" || cc === "TW") return 95;
    return 55;
  }
  if (ADRIATIC_ALPS_HOTEL.has(cc)) return 100;
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

/**
 * Separate overnight line for the UI.
 * Motorhome: camp share stays inside the daily plan — no separate overnight row.
 * Hotel / car road-trip: rough hotel room × rooms × nights.
 */
export function estimateOvernightStay(opts: {
  dayCount: number;
  pax: number;
  countryCode?: string;
  mode: "hotel" | "car" | "motorhome";
}): OvernightEstimate {
  const nights = tripOvernightNights(opts.dayCount);
  if (nights <= 0 || opts.mode === "motorhome") {
    return { kind: "none", nightlyEur: 0, nights: 0, rooms: 0, totalEur: 0 };
  }

  const rooms = Math.max(1, Math.ceil(Math.max(1, opts.pax) / 2));
  const nightlyEur = estimateHotelRoomNightlyEur(opts.countryCode);
  return {
    kind: "hotel",
    nightlyEur,
    nights,
    rooms,
    totalEur: Math.round(nightlyEur * rooms * nights),
  };
}
