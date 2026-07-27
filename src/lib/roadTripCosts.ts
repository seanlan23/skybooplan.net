/**
 * Road toll (cestnine / vinjete) estimates for car & motorhome day budgets.
 * Per-person share — added AFTER meal/sight ceils so IT/FR tolls are not clipped away.
 *
 * Rates are mid-2026 EU tourist approximations (autostrada / péage / vignette amortised).
 */

export type RoadVehicleMode = "car" | "motorhome";

/** € per km on tolled highways (car). Motorhome often one class higher. */
const TOLL_EUR_PER_KM_CAR: Record<string, number> = {
  IT: 0.1,
  FR: 0.12,
  ES: 0.08,
  PT: 0.07,
  HR: 0.08,
  GR: 0.06,
  PL: 0.05,
  CZ: 0.04,
  HU: 0.05,
  SK: 0.04,
  NO: 0.18,
  // Vignette countries: km rate low; daily vignette share handles most cost.
  AT: 0.02,
  SI: 0.02,
  CH: 0.02,
  // Mostly toll-free for private cars.
  DE: 0,
  NL: 0,
  BE: 0.02,
  DK: 0.02,
  SE: 0.03,
  FI: 0,
  IE: 0.04,
  GB: 0.03,
  AL: 0.03,
  ME: 0.04,
  BA: 0.03,
  MK: 0.02,
  RS: 0.04,
  BG: 0.03,
  RO: 0.03,
};

/** Amortised vignette / sticky toll pass when the day has meaningful driving (EUR household). */
const VIGNETTE_DAY_SHARE_EUR: Record<string, number> = {
  AT: 4,
  SI: 3,
  CH: 5,
  CZ: 3,
  SK: 3,
  HU: 4,
};

const DEFAULT_TOLL_PER_KM = 0.06;
/** Skip tiny local hops — parking/city driving, not highway tolls. */
const MIN_KM_FOR_TOLLS = 50;
/** Soft per-person cap so a 600 km Italy day doesn't dominate the card. */
const MAX_TOLL_PER_PERSON = 45;

export function tollEurPerKm(country: string | undefined, mode: RoadVehicleMode): number {
  const cc = (country ?? "").trim().toUpperCase();
  const base = TOLL_EUR_PER_KM_CAR[cc] ?? DEFAULT_TOLL_PER_KM;
  // Motorhomes often pay a higher toll class on IT/FR/ES.
  if (mode === "motorhome" && base > 0) return Math.round(base * 1.25 * 1000) / 1000;
  return base;
}

export function vignetteDayShareEur(country: string | undefined): number {
  const cc = (country ?? "").trim().toUpperCase();
  return VIGNETTE_DAY_SHARE_EUR[cc] ?? 0;
}

/**
 * Household toll estimate for one driving day, then split across travellers.
 */
export function estimateDayTollEurPerPerson(opts: {
  drivingDistanceKm?: number;
  country?: string;
  pax: number;
  mode: RoadVehicleMode;
}): number {
  const km = Math.max(0, opts.drivingDistanceKm ?? 0);
  if (km < MIN_KM_FOR_TOLLS) return 0;

  const pax = Math.max(1, opts.pax);
  const perKm = tollEurPerKm(opts.country, opts.mode);
  const distanceToll = km * perKm;
  const vignette = vignetteDayShareEur(opts.country);
  // Distance tolls + amortised vignette (AT/SI/CH) when driving that day.
  const household = distanceToll + vignette;
  const perPerson = Math.round(household / pax);
  return Math.min(MAX_TOLL_PER_PERSON, Math.max(0, perPerson));
}

/** Add tolls on top of an already-ceiled daily budget (car / motorhome only). */
export function applyRoadTollToDailyBudget(
  dailyEur: number,
  opts: {
    drivingDistanceKm?: number;
    country?: string;
    pax: number;
    mode: RoadVehicleMode;
  },
): number {
  const toll = estimateDayTollEurPerPerson(opts);
  if (toll <= 0) return Math.max(0, Math.round(dailyEur));
  return Math.max(0, Math.round(dailyEur + toll));
}
