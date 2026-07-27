/**
 * Mid-range / Standard daily budget per person (EUR).
 * Industry / EU-style estimate for 1 person/day assuming a shared double room:
 * 3★ hotel or private apt share + 3 meals + local transport + 1–2 attractions.
 * Excludes international flights / long-haul to destination and luxury shopping.
 *
 * Source: curated top-80 visited countries mid-range table (2026).
 */
export const COUNTRY_MID_DAILY_EUR: Record<string, number> = {
  FR: 130,
  ES: 120,
  US: 180,
  IT: 130,
  TR: 60,
  CN: 70,
  MX: 65,
  TH: 50,
  DE: 120,
  GB: 140,
  JP: 110,
  AT: 130,
  GR: 100,
  MY: 45,
  PT: 90,
  CA: 140,
  PL: 70,
  NL: 140,
  VN: 40,
  KR: 95,
  HR: 100,
  HU: 75,
  AE: 170,
  IN: 35,
  CH: 200,
  SG: 160,
  DK: 150,
  SE: 130,
  AU: 150,
  CZ: 80,
  ID: 45,
  EG: 40,
  MA: 50,
  SA: 120,
  BE: 130,
  ZA: 70,
  PH: 45,
  AR: 55,
  BR: 60,
  CO: 45,
  PE: 50,
  AL: 50,
  ME: 65,
  LK: 35,
  NO: 170,
  FI: 140,
  IE: 140,
  RO: 55,
  BG: 50,
  SK: 65,
  SI: 85,
  CY: 95,
  MT: 100,
  IS: 190,
  NZ: 140,
  KH: 35,
  LA: 30,
  NP: 30,
  JO: 80,
  OM: 100,
  GE: 45,
  AM: 40,
  KZ: 45,
  UZ: 35,
  CL: 70,
  CR: 85,
  PA: 75,
  DO: 90,
  JM: 110,
  CU: 60,
  KE: 75,
  TZ: 85,
  NA: 80,
  BW: 120,
  MU: 130,
  SC: 180,
  MV: 200,
  QA: 150,
  TW: 70,
  TN: 40,
  // Balkans / neighbours not in top-80 list — aligned to regional peers.
  BA: 55,
  MK: 50,
  RS: 55,
  XK: 45,
  // Default Western / Nordic peers.
  LU: 150,
  LI: 190,
  MC: 220,
  AD: 120,
  EE: 90,
  LV: 75,
  LT: 75,
};

const DEFAULT_MID_DAILY_EUR = 100;

export function countryMidDailyBudgetEur(country?: string): number {
  const cc = (country ?? "").trim().toUpperCase();
  if (!cc) return DEFAULT_MID_DAILY_EUR;
  return COUNTRY_MID_DAILY_EUR[cc] ?? DEFAULT_MID_DAILY_EUR;
}

/** budget = mid − 30% · premium ≈ mid + 45% (lodging + dining step-up). */
export function countryTierDailyBudgetEur(
  country: string | undefined,
  tier: "budget" | "mid" | "premium",
): number {
  const mid = countryMidDailyBudgetEur(country);
  if (tier === "budget") return Math.max(20, Math.round(mid * 0.7));
  if (tier === "premium") return Math.round(mid * 1.45);
  return mid;
}

/**
 * Infer coarse price tier from industry mid daily (for meal/transfer bands).
 * ≥150 ≈ premium markets · ≤55 ≈ value · else mid.
 */
export function priceTierFromCountryMid(country?: string): "budget" | "mid" | "premium" {
  const mid = countryMidDailyBudgetEur(country);
  if (mid >= 150) return "premium";
  if (mid <= 55) return "budget";
  return "mid";
}
