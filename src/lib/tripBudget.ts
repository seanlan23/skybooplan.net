/** Parse price labels (€, THB, free) into approximate EUR for daily budget sums. */
export function parsePriceLabelToEur(label?: string): number {
  if (!label || label === "—") return 0;
  const t = label.trim().toLowerCase();
  if (/brezplačno|free|€\s*0|included|vključeno/.test(t)) return 0;

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

type ActivityLike = { priceLabel?: string; price?: string; type?: string };

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
        const eur = parsePriceLabelToEur(a.priceLabel || a.price);
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
      (a) => a.type === "TRANSPORT" && parsePriceLabelToEur(a.priceLabel || a.price) > 0,
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

/** Per-day budget inputs — varies by arrival, departure, theme-park days, etc. */
export function dayBudgetParams(
  tier: "premium" | "mid" | "budget",
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

function activityListTotalEur(
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
): number {
  if (!activities) return 0;
  let sum = 0;
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    for (const a of activities[slot]) {
      if (a.type === "TRANSPORT" || a.type === "STAY") continue;
      sum += parsePriceLabelToEur(a.priceLabel || a.price);
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

  const ticketTotal = activityListTotalEur(activities);
  if (isSafariRegionCity(opts.regionCity ?? "") || /safari|game drive|ngorongoro/i.test(text)) {
    if (ticketTotal >= 300) return "safari-balloon";
    return "safari";
  }
  if (ticketTotal >= 60) return "ticket-heavy";
  return "sightseeing";
}

/** Floor unrealistically low AI safari quotes (park fees, 4x4, lodge). Per person. */
export function applySafariBudgetFloor(
  eur: number,
  kind: DayBudgetKind,
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
): number {
  const listed = activityListTotalEur(activities);
  if (kind === "safari-balloon") {
    // Balloon ~500 € + lodge night + meals
    return Math.max(eur, listed + 180, 620);
  }
  if (kind === "safari") {
    // Game drive + park fees + tented camp (often 200–400 €/night pp)
    const withLodge = listed >= 200 ? listed + 220 : 450;
    return Math.max(eur, withLodge);
  }
  return eur;
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

/** Floor for motorhome trips — rental share, fuel, campsite, tolls (per person). */
export function applyMotorhomeBudgetFloor(
  eur: number,
  kind: DayBudgetKind,
  pax: number,
): number {
  const rentalShare = Math.round(95 / Math.max(1, pax));
  if (kind === "cross-country-travel") {
    return Math.max(eur, rentalShare + 35, 110);
  }
  if (kind === "departure" || kind === "arrival") {
    return Math.max(eur, rentalShare + 15, 70);
  }
  return Math.max(eur, rentalShare + 25, 85);
}

/** Hybrid motorhome + periodic hotel night — bump budget on hotel rest days. Per person. */
export function applyHotelRestBudgetFloor(
  eur: number,
  isHotelRestDay: boolean,
  pax: number,
): number {
  if (!isHotelRestDay) return eur;
  const hotelShare = Math.round(130 / Math.max(1, pax));
  return Math.max(eur, hotelShare + 90, 200);
}

/**
 * Gemini often returns dailyBudget as a household/day total (not per person).
 * Normalize to per-person for UI that multiplies by pax again.
 */
export function normalizeGeminiDailyBudgetPerPerson(
  geminiDaily: number,
  computedPerPerson: number,
  activityTotalEur: number,
  travelers: number,
): number {
  if (geminiDaily <= 0) return computedPerPerson;
  const pax = Math.max(1, travelers);
  const asGroupPerPerson = Math.round(geminiDaily / pax);

  // Household total (e.g. 380 € / 4 ≈ 95 € na osebo)
  if (geminiDaily >= activityTotalEur * 0.8 && asGroupPerPerson >= 15 && asGroupPerPerson <= 180) {
    return asGroupPerPerson;
  }

  // Already per-person but inflated vs listed activities
  if (geminiDaily <= 180) {
    const floor = Math.max(computedPerPerson, Math.round(activityTotalEur / pax) + 8);
    return Math.min(geminiDaily, Math.max(floor, computedPerPerson));
  }

  return computedPerPerson > 0 ? computedPerPerson : asGroupPerPerson;
}

/** Sum listed activity EUR (group costs, not per-person). */
export function sumListedActivityEur(
  activities: { morning: ActivityLike[]; afternoon: ActivityLike[]; evening: ActivityLike[] } | undefined,
): number {
  if (!activities) return 0;
  let sum = 0;
  for (const slot of ["morning", "afternoon", "evening"] as const) {
    for (const a of activities[slot]) {
      if (a.type === "STAY") continue;
      sum += parsePriceLabelToEur(a.priceLabel || a.price);
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
