import {
  COUNTRY_MID_DAILY_EUR,
  countryTierDailyBudgetEur,
} from "@/lib/countryDailyBudget";

/** Parse price labels (€, $, THB, free) into approximate EUR for daily budget sums. */
export function parsePriceLabelToEur(label?: string): number {
  if (!label || label === "—") return 0;
  const t = label.trim().toLowerCase();
  if (/brezplačno|free|€\s*0|\$\s*0|included|vključeno/.test(t)) return 0;

  const eurRange =
    /€\s*(\d+(?:[.,]\d+)?)\s*[-–]\s*€?\s*(\d+(?:[.,]\d+)?)/.exec(label) ??
    /(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*€/.exec(label);
  if (eurRange) {
    const a = Number(eurRange[1].replace(",", "."));
    const b = Number(eurRange[2].replace(",", "."));
    return Math.round((a + b) / 2);
  }

  const eurSingle = /€\s*(\d+(?:[.,]\d+)?)/.exec(label) ?? /(\d+(?:[.,]\d+)?)\s*€/.exec(label);
  if (eurSingle) return Math.round(Number(eurSingle[1].replace(",", ".")));

  // Display currency may be USD while values stay EUR-equivalent for budgeting.
  const usdRange =
    /\$\s*(\d+(?:[.,]\d+)?)\s*[-–]\s*\$?\s*(\d+(?:[.,]\d+)?)/.exec(label) ??
    /(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*\$/.exec(label);
  if (usdRange) {
    const a = Number(usdRange[1].replace(",", "."));
    const b = Number(usdRange[2].replace(",", "."));
    return Math.round((a + b) / 2);
  }
  const usdSingle = /\$\s*(\d+(?:[.,]\d+)?)/.exec(label) ?? /(\d+(?:[.,]\d+)?)\s*\$/.exec(label);
  if (usdSingle) return Math.round(Number(usdSingle[1].replace(",", ".")));

  const thbRange = /(\d+)\s*[-–]\s*(\d+)\s*thb/i.exec(label);
  if (thbRange) {
    const mid = (Number(thbRange[1]) + Number(thbRange[2])) / 2;
    return Math.round(mid / 37);
  }

  const thbSingle = /(\d+)\s*thb/i.exec(label);
  if (thbSingle) return Math.round(Number(thbSingle[1]) / 37);

  const numOnly = /^(\d+)$/.exec(t);
  if (numOnly) return Number(numOnly[1]);

  return 0;
}

type ActivityLike = {
  priceLabel?: string;
  price?: string;
  type?: string;
  estimatedCostEur?: number;
  name?: string;
};

/** Prefer price label; fall back to estimatedCostEur (Gemini often sets only that). */
export function activityCostEur(a: ActivityLike): number {
  const fromLabel = parsePriceLabelToEur(a.priceLabel || a.price);
  if (fromLabel > 0) return fromLabel;
  if (typeof a.estimatedCostEur === "number" && Number.isFinite(a.estimatedCostEur) && a.estimatedCostEur >= 0) {
    return Math.round(a.estimatedCostEur);
  }
  return 0;
}

/** Estimated spend per traveler for one day (meals, sights, shared transport split). */
export function estimateDayBudgetEur(
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
  transportCost?: string,
  opts?: {
    baseMealsEur?: number;
    pax?: number;
    minDailyEur?: number;
    localTransitEur?: number;
  },
): number {
  const pax = Math.max(1, opts?.pax ?? 1);
  let perPerson = opts?.baseMealsEur ?? 18;

  if (activities) {
    for (const slot of ["morning", "afternoon", "evening"] as const) {
      for (const a of activities[slot]) {
        const eur = activityCostEur(a);
        if (a.type === "TRANSPORT") {
          perPerson += Math.round(eur / pax);
        } else {
          perPerson += eur;
        }
      }
    }
  }

  const hasPricedTransportActivity =
    activities &&
    [...activities.morning, ...activities.afternoon, ...activities.evening].some(
      (a) => a.type === "TRANSPORT" && activityCostEur(a) > 0,
    );

  if (transportCost && !hasPricedTransportActivity) {
    perPerson += Math.round(parsePriceLabelToEur(transportCost) / pax);
  }

  const transit = opts?.localTransitEur ?? 0;
  const raw = Math.round(perPerson + transit);
  const floor = opts?.minDailyEur ?? 0;
  return floor > 0 ? Math.max(floor, raw) : raw;
}

export type DayBudgetKind =
  | "arrival"
  | "departure"
  | "sightseeing"
  | "ticket-heavy"
  | "safari"
  | "safari-balloon"
  | "cross-country-travel";

export type BudgetTier = "premium" | "mid" | "budget";

/** Per-day budget inputs — varies by arrival, departure, theme-park days, etc. */
export function dayBudgetParams(
  tier: BudgetTier,
  kind: DayBudgetKind,
  sprawling: boolean,
  mealsFullDayEur: number,
): { baseMealsEur: number; minDailyEur: number; localTransitEur: number } {
  const transitFull = sprawling
    ? tier === "premium"
      ? 35
      : tier === "mid"
        ? 22
        : 12
    : tier === "premium"
      ? 18
      : tier === "mid"
        ? 10
        : 5;

  switch (kind) {
    case "arrival":
      return {
        baseMealsEur: Math.round(mealsFullDayEur * 0.45),
        minDailyEur: tier === "premium" ? 50 : tier === "mid" ? 32 : 22,
        localTransitEur: Math.round(transitFull * 0.6),
      };
    case "departure":
      return {
        baseMealsEur: Math.round(mealsFullDayEur * 0.25),
        minDailyEur: tier === "premium" ? 30 : tier === "mid" ? 22 : 15,
        localTransitEur: 0,
      };
    case "ticket-heavy":
      return {
        baseMealsEur: mealsFullDayEur,
        minDailyEur: 0,
        localTransitEur: transitFull,
      };
    case "safari":
      return {
        baseMealsEur: Math.max(mealsFullDayEur, 95),
        minDailyEur: 0,
        localTransitEur: 0,
      };
    case "safari-balloon":
      return {
        baseMealsEur: Math.max(mealsFullDayEur, 100),
        minDailyEur: 0,
        localTransitEur: 0,
      };
    case "cross-country-travel":
      return {
        baseMealsEur: Math.round(mealsFullDayEur * 0.5),
        minDailyEur: tier === "premium" ? 120 : 80,
        localTransitEur: 0,
      };
    default:
      return {
        baseMealsEur: mealsFullDayEur,
        minDailyEur: tier === "premium" ? 55 : tier === "mid" ? 35 : 22,
        localTransitEur: transitFull,
      };
  }
}

function isMealLikeActivity(a: ActivityLike): boolean {
  const t = (a.type ?? "").toUpperCase();
  if (t === "EAT" || t === "FOOD" || t === "MEAL") return true;
  return /zajtrk|kosilo|večerja|breakfast|lunch|dinner|seafood|kavarn|café|cafe\b|restavrac/i.test(
    `${a.name ?? ""}`,
  );
}

function activityListTotalEur(
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
): number {
  if (!activities) return 0;
  let sum = 0;
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    for (const a of activities[slot]) {
      if (a.type === "TRANSPORT" || a.type === "STAY") continue;
      sum += activityCostEur(a);
    }
  }
  return sum;
}

/** Tickets/sights only — meals must not push a tuk-tuk day into "ticket-heavy". */
function activityTicketTotalEur(
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
): number {
  if (!activities) return 0;
  let sum = 0;
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    for (const a of activities[slot]) {
      if (a.type === "TRANSPORT" || a.type === "STAY" || isMealLikeActivity(a)) continue;
      sum += activityCostEur(a);
    }
  }
  return sum;
}

function activityText(
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
): string {
  if (!activities) return "";
  return [...activities.morning, ...activities.afternoon, ...activities.evening]
    .map((a) => `${a.name ?? ""} ${a.priceLabel ?? ""} ${a.price ?? ""}`)
    .join(" ");
}

function isSafariRegionCity(city: string): boolean {
  return /serengeti|ngorongoro|arusha|manyara|tarangire/i.test(city);
}

function isCanadaPremiumCity(city: string): boolean {
  return /banff|vancouver|toronto|niagara|ottawa|whistler|jasper|calgary/i.test(city);
}

/** Classify day from listed activities (theme parks, arrival, departure, safari). */
export function classifyDayBudgetKind(
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
  opts: { isArrival: boolean; isDeparture: boolean; regionCity?: string },
): DayBudgetKind {
  if (opts.isDeparture) return "departure";
  if (opts.isArrival) return "arrival";

  const text = activityText(activities);
  if (/prevoz:|travel:/i.test(text) && /cel dan|full day|notranji let|domestic flight/i.test(text)) {
    return "cross-country-travel";
  }
  if (/balloon/i.test(text)) return "safari-balloon";

  const ticketTotal = activityTicketTotalEur(activities);
  if (isSafariRegionCity(opts.regionCity ?? "") || /safari|game drive|ngorongoro/i.test(text)) {
    if (ticketTotal >= 300) return "safari-balloon";
    return "safari";
  }
  if (ticketTotal >= 60) return "ticket-heavy";
  return "sightseeing";
}

function isLodgeSafariDay(
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
): boolean {
  const text = activityText(activities);
  return /lodge|tented\s*camp|serengeti|ngorongoro|manyara|tarangire|fly[\s-]?in|concession|okavango.*(camp|lodge)|moremi.*(overnight|camp)|chobe.*(lodge|overnight)/i.test(
    text,
  );
}

/** Floor unrealistically low AI safari quotes (park fees, 4x4, lodge). Per person. */
export function applySafariBudgetFloor(
  eur: number,
  kind: DayBudgetKind,
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
  opts?: { tier?: BudgetTier },
): number {
  const listed = activityListTotalEur(activities);
  const tier = opts?.tier ?? "mid";

  if (kind === "safari-balloon") {
    // Balloon is a premium product — keep a firm floor when it appears.
    return Math.max(eur, listed + 180, tier === "premium" ? 620 : 480);
  }

  if (kind !== "safari") return eur;

  // City / day-trip "safari" (Mokolodi, short game drive): do NOT invent lodge nights.
  // Old floor forced €450/pp and blew Botswana/Namibia totals past €2k budgets.
  if (!isLodgeSafariDay(activities) && listed < 160) {
    return Math.max(eur, listed + 55, 95);
  }

  if (!isLodgeSafariDay(activities) && listed < 280) {
    return Math.max(eur, listed + 90, 200);
  }

  // Multi-day lodge / fly-in safari nights (Serengeti, Okavango camps, …).
  const lodgeFloor = tier === "premium" ? 450 : tier === "budget" ? 280 : 340;
  return Math.max(eur, listed + 180, lodgeFloor);
}

/** Floor unrealistically low Canada quotes (Banff/Vancouver hotels, park fees, domestic flights). */
export function applyCanadaBudgetFloor(
  eur: number,
  kind: DayBudgetKind,
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
  regionCity: string,
  country: string,
): number {
  if (country !== "CA" && !isCanadaPremiumCity(regionCity)) return eur;
  if (kind === "departure") return eur;

  const listed = activityListTotalEur(activities);
  if (kind === "cross-country-travel") {
    return Math.max(eur, listed + 80, 150);
  }
  if (/banff|jasper|whistler/i.test(regionCity)) {
    return Math.max(eur, listed + 60, 130);
  }
  if (/vancouver|toronto/i.test(regionCity)) {
    return Math.max(eur, listed + 40, 95);
  }
  return Math.max(eur, listed + 25, 75);
}

function isUsPremiumCity(city: string): boolean {
  return /new york|nyc|manhattan|brooklyn|williamsburg|los angeles|san francisco|chicago|miami|boston|seattle|las vegas|washington/i.test(
    city,
  );
}

/** Floor unrealistically low US quotes (NYC dinner+cocktails alone can be 80–120). */
export function applyUsBudgetFloor(
  eur: number,
  kind: DayBudgetKind,
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
  regionCity: string,
  country: string,
): number {
  if (country !== "US" && !isUsPremiumCity(regionCity)) return eur;
  if (kind === "departure") return eur;

  const listed = activityListTotalEur(activities);
  if (kind === "cross-country-travel") {
    return Math.max(eur, listed + 90, 170);
  }
  if (/new york|nyc|manhattan|brooklyn|williamsburg|san francisco|los angeles/i.test(regionCity)) {
    return Math.max(eur, listed + 55, 150);
  }
  return Math.max(eur, listed + 35, 110);
}

/**
 * Floor for motorhome day spend PER PERSON (food, sights, fuel/camp share).
 * Do NOT bake full vehicle rental into the daily figure — rental is excluded from the trip total.
 */
export function applyMotorhomeBudgetFloor(
  eur: number,
  kind: DayBudgetKind,
  _pax: number,
): number {
  if (kind === "cross-country-travel") {
    return Math.max(eur, 55);
  }
  if (kind === "departure" || kind === "arrival") {
    return Math.max(eur, 35);
  }
  return Math.max(eur, 45);
}

/** Cap absurd per-person motorhome days (Gemini often returns household totals). */
export function applyMotorhomeBudgetCeil(
  eur: number,
  kind: DayBudgetKind,
): number {
  if (kind === "cross-country-travel") return Math.min(eur, 120);
  if (kind === "departure" || kind === "arrival") return Math.min(eur, 75);
  return Math.min(eur, 100);
}

/**
 * Hard per-person daily ceilings for ALL destinations.
 * Stops Gemini household leaks (e.g. €200+/pp → ×3 pax = €6k+ trips).
 * Ceils sit above regional floors (US sightseeing ≥150 still fits mid=165).
 */
export function applyGlobalDayBudgetCeil(
  eur: number,
  kind: DayBudgetKind,
  tier: BudgetTier = "mid",
): number {
  const caps: Record<BudgetTier, Record<DayBudgetKind, number>> = {
    budget: {
      arrival: 55,
      departure: 40,
      sightseeing: 85,
      "ticket-heavy": 160,
      safari: 420,
      "safari-balloon": 650,
      "cross-country-travel": 140,
    },
    mid: {
      arrival: 85,
      departure: 55,
      // Above US NYC floor (~150); still kills €200–400 Gemini leaks.
      sightseeing: 165,
      "ticket-heavy": 220,
      safari: 480,
      "safari-balloon": 700,
      "cross-country-travel": 180,
    },
    premium: {
      arrival: 130,
      departure: 90,
      sightseeing: 200,
      "ticket-heavy": 320,
      safari: 550,
      "safari-balloon": 780,
      "cross-country-travel": 260,
    },
  };
  const cap = caps[tier][kind] ?? caps[tier].sightseeing;
  return Math.min(Math.max(0, Math.round(eur)), cap);
}

/** SE Asia / similar value destinations — global mid ceil is NYC-sized and ×pax blows up to €6k. */
const VALUE_BUDGET_COUNTRIES = new Set([
  "TH",
  "VN",
  "KH",
  "LA",
  "ID",
  "MY",
  "PH",
  "MM",
  "LK",
  "IN",
  "NP",
  "BD",
  // Balkans / SE Europe road-trip value band (food + stays cheap vs WE/US).
  "AL",
  "BA",
  "ME",
  "MK",
  "RS",
  "XK",
  "BG",
  "RO",
  "HR",
]);

export function isValueDestinationBudget(country?: string, city?: string): boolean {
  const cc = (country ?? "").trim().toUpperCase();
  if (VALUE_BUDGET_COUNTRIES.has(cc)) return true;
  return /phuket|bangkok|krabi|chiang\s*mai|patong|karon|ao\s*nang|railay|koh\s*|ko\s*|bali|ubud|kuta|hanoi|saigon|ho\s*chi\s*minh|siem\s*reap|manila|cebu|boracay|el\s*nido|kuala|penang|šri\s*lanka|sri\s*lanka|srilanka|colombo|galle|ella|negombo|unawatuna|hkt|bkk|cnx|kbv|dps|sgn|han|mnl|cmb|hri|tirana|berat|saranda|himar|ksamil|gjirokast|mostar|kotor|budva|dubrovnik|split|zadar|albania|albanij|bocna|bosnia|crna\s*gora|montenegro|tia\b/i.test(
    city ?? "",
  );
}

/**
 * Tighter per-person daily caps for value destinations (Thailand, Vietnam, …).
 * Prefer applyCountryDayBudgetCeil when the country is in the industry mid table.
 * Apply AFTER applyGlobalDayBudgetCeil. No-op outside value regions / safari days.
 */
export function applyValueDestinationDayBudgetCeil(
  eur: number,
  kind: DayBudgetKind,
  tier: BudgetTier = "mid",
  opts?: { country?: string; city?: string },
): number {
  if (kind === "safari" || kind === "safari-balloon") return eur;
  if (!isValueDestinationBudget(opts?.country, opts?.city)) return eur;

  const caps: Record<BudgetTier, Partial<Record<DayBudgetKind, number>>> = {
    budget: {
      arrival: 45,
      departure: 30,
      sightseeing: 65,
      "ticket-heavy": 110,
      "cross-country-travel": 85,
    },
    mid: {
      arrival: 55,
      departure: 40,
      sightseeing: 75,
      "ticket-heavy": 110,
      "cross-country-travel": 90,
    },
    premium: {
      arrival: 100,
      departure: 70,
      sightseeing: 130,
      "ticket-heavy": 180,
      "cross-country-travel": 140,
    },
  };
  const cap = caps[tier][kind] ?? caps[tier].sightseeing ?? eur;
  return Math.min(Math.max(0, Math.round(eur)), cap);
}

export function hasCountryMidDailyBudget(country?: string): boolean {
  const cc = (country ?? "").trim().toUpperCase();
  return Boolean(cc && COUNTRY_MID_DAILY_EUR[cc] != null);
}

/**
 * Industry mid-range daily budget per person (shared 3★ room + meals + local transport + 1–2 sights).
 * Primary ceil for known countries — CH €200, NO €170, IT/FR €130, AL €50, TH €50, …
 */
export function applyCountryDayBudgetCeil(
  eur: number,
  kind: DayBudgetKind,
  tier: BudgetTier = "mid",
  opts?: { country?: string; city?: string },
): number {
  if (kind === "safari" || kind === "safari-balloon") return eur;
  const cc = (opts?.country ?? "").trim().toUpperCase();
  if (!cc || COUNTRY_MID_DAILY_EUR[cc] == null) return eur;

  const base = countryTierDailyBudgetEur(cc, tier);
  const kindFactor: Partial<Record<DayBudgetKind, number>> = {
    arrival: 0.55,
    departure: 0.4,
    sightseeing: 1,
    "ticket-heavy": 1.2,
    "cross-country-travel": 0.85,
  };
  const cap = Math.max(20, Math.round(base * (kindFactor[kind] ?? 1)));
  return Math.min(Math.max(0, Math.round(eur)), cap);
}

/** @deprecated Use applyCountryDayBudgetCeil — kept as alias for older imports/tests. */
export function isEuropeTouristBudget(country?: string, city?: string): boolean {
  const cc = (country ?? "").trim().toUpperCase();
  return hasCountryMidDailyBudget(cc) && !isValueDestinationBudget(country, city);
}

/** @deprecated Use applyCountryDayBudgetCeil. */
export function applyEuropeTouristDayBudgetCeil(
  eur: number,
  kind: DayBudgetKind,
  tier: BudgetTier = "mid",
  opts?: { country?: string; city?: string },
): number {
  return applyCountryDayBudgetCeil(eur, kind, tier, opts);
}

/** Hybrid motorhome + periodic hotel night — bump budget on hotel rest days. Per person. */
export function applyHotelRestBudgetFloor(
  eur: number,
  isHotelRestDay: boolean,
  pax: number,
): number {
  if (!isHotelRestDay) return eur;
  const hotelShare = Math.round(90 / Math.max(1, pax));
  return Math.max(eur, hotelShare + 45, 120);
}

/**
 * Motorhome prompts historically ask for household daily (fuel + camp + food).
 * Normalize to per-person before UI multiplies by pax again.
 */
export function normalizeMotorhomeDailyBudgetPerPerson(
  geminiDaily: number,
  computedPerPerson: number,
  travelers: number,
): number {
  const pax = Math.max(1, travelers);
  if (geminiDaily <= 0) {
    return Math.min(Math.max(computedPerPerson, 40), 100);
  }
  // Already looks per-person (solo camper or explicit pp figure).
  if (geminiDaily <= 85) {
    return Math.max(geminiDaily, Math.round(computedPerPerson * 0.85), 35);
  }
  // Household / inflated — split across travellers.
  const split = Math.round(geminiDaily / pax);
  const floor = Math.max(35, Math.round(computedPerPerson * 0.75));
  return Math.min(Math.max(split, floor), 100);
}

/**
 * Gemini often returns dailyBudget as a household/day total (not per person).
 * Normalize to per-person for UI that multiplies by pax again.
 * Never undercut listed activity spend (old Math.min + /pax made NYC days too cheap).
 */
export function normalizeGeminiDailyBudgetPerPerson(
  geminiDaily: number,
  computedPerPerson: number,
  activityTotalEur: number,
  travelers: number,
): number {
  if (geminiDaily <= 0) {
    return Math.max(computedPerPerson, activityTotalEur);
  }
  const pax = Math.max(1, travelers);
  const asGroupPerPerson = Math.round(geminiDaily / pax);
  // Activity labels / estimatedCostEur are already per person — do not divide by pax.
  const activityFloor = activityTotalEur > 0 ? activityTotalEur + 8 : 0;
  const floor = Math.max(computedPerPerson, activityFloor);

  const looksLikeHousehold =
    pax >= 2 &&
    geminiDaily >= 140 &&
    asGroupPerPerson >= 15 &&
    asGroupPerPerson <= 220 &&
    (geminiDaily >= computedPerPerson * 1.8 ||
      geminiDaily >= activityFloor * 2.2 ||
      geminiDaily >= 180);

  if (looksLikeHousehold) {
    return Math.max(
      asGroupPerPerson,
      Math.min(activityFloor, asGroupPerPerson + 25),
      Math.round(computedPerPerson * 0.85),
    );
  }

  // Solo / already-pp: still don't trust absurd Gemini guesses when activities are light.
  if (geminiDaily > 160 && activityTotalEur > 0 && activityTotalEur < 70) {
    return Math.max(floor, Math.min(geminiDaily, activityFloor + 45, 120));
  }

  return Math.max(geminiDaily, floor);
}

/** Sum listed activity EUR (per person — tickets/meals as shown on cards). */
export function sumListedActivityEur(
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
): number {
  if (!activities) return 0;
  let sum = 0;
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    for (const a of activities[slot]) {
      if (a.type === "STAY") continue;
      sum += activityCostEur(a);
    }
  }
  return sum;
}

/** Sum daily per-person budgets × travelers — replaces AI guess for trip total. */
export function computeTripTotalBudgetEur(
  days: Array<{ dailyBudgetEur?: number }>,
  pax: number,
): number {
  const travelers = Math.max(1, pax);
  return days.reduce((sum, d) => sum + (d.dailyBudgetEur ?? 0) * travelers, 0);
}

/**
 * Soft trip envelope: trim only Gemini inflation above industry mid × days (+12%).
 * Does NOT crush long IT/FR trips down to hero €2000/pp — that undercuts industry rates
 * (e.g. Italy €130 × 21d = €2730/pp with hotels).
 */
export function scaleDailyBudgetsToTripCap(
  days: Array<{ dailyBudgetEur?: number }>,
  tier: BudgetTier,
  opts?: { minDailyEur?: number; country?: string },
): void {
  if (tier === "premium" || days.length === 0) return;

  const industryTotal = countryTierDailyBudgetEur(opts?.country, tier) * days.length;
  const trimAt = Math.round(industryTotal * 1.12);
  const sum = days.reduce((s, d) => s + (d.dailyBudgetEur ?? 0), 0);
  if (sum <= trimAt) return;

  const minD = Math.max(15, opts?.minDailyEur ?? 25);
  const scale = trimAt / sum;
  for (const d of days) {
    const raw = d.dailyBudgetEur ?? 0;
    d.dailyBudgetEur = Math.max(minD, Math.round(raw * scale));
  }

  let newSum = days.reduce((s, d) => s + (d.dailyBudgetEur ?? 0), 0);
  let guard = 0;
  while (newSum > trimAt && guard++ < 500) {
    let idx = 0;
    let max = -1;
    for (let i = 0; i < days.length; i++) {
      const v = days[i]!.dailyBudgetEur ?? 0;
      if (v > max && v > minD) {
        max = v;
        idx = i;
      }
    }
    if (max <= minD) break;
    days[idx]!.dailyBudgetEur = max - 1;
    newSum -= 1;
  }
}

export function tripDestinationBudgetCapPerPerson(tier: BudgetTier): number | null {
  if (tier === "budget") return 1000;
  if (tier === "mid") return 2000;
  return null;
}
