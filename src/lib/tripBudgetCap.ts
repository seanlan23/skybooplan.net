import type { TripBudgetTier } from "@/lib/geminiPro.shared";

/** Package (flight + stay) may exceed the stated band by this factor, never more. */
export const BUDGET_CAP_SLACK = 1.1;

export type TripBudgetBand = {
  minPerPerson: number | null;
  maxPerPerson: number | null;
};

export function parseTripBudgetBand(label: string | undefined | null): TripBudgetBand {
  const lower = (label ?? "")
    .toLowerCase()
    .replace(/€|eur|\$|usd/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!lower) return { minPerPerson: null, maxPerPerson: null };

  if (
    /\b2000plus\b|\b2000\s*\+|over\s*2000|ve[cč]\s*kot\s*2000/.test(lower) ||
    (lower.includes("2000") && (lower.includes("+") || lower.includes("plus")))
  ) {
    return { minPerPerson: 2000, maxPerPerson: null };
  }

  if (/\bunder500\b|\bdo\s*500\b|\bup\s*to\s*500\b|\bunder\s*500\b|\bbis\s*500\b/.test(lower)) {
    return { minPerPerson: null, maxPerPerson: 500 };
  }

  const range = lower.match(/(\d{3,5})\s*[-–—]\s*(\d{3,5})/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && max >= min) {
      return { minPerPerson: min, maxPerPerson: max };
    }
  }

  return { minPerPerson: null, maxPerPerson: null };
}

export function tripBudgetBandFromPlannerTier(tier: TripBudgetTier | undefined): TripBudgetBand {
  if (tier === "budget") return { minPerPerson: null, maxPerPerson: 1000 };
  if (tier === "standard") return { minPerPerson: 500, maxPerPerson: 2000 };
  if (tier === "premium") return { minPerPerson: 2000, maxPerPerson: null };
  return { minPerPerson: null, maxPerPerson: null };
}

export function resolveTripBudgetBand(
  label: string | undefined | null,
  fallbackTier?: TripBudgetTier,
): TripBudgetBand {
  const parsed = parseTripBudgetBand(label);
  if (parsed.maxPerPerson != null || parsed.minPerPerson != null) return parsed;
  return tripBudgetBandFromPlannerTier(fallbackTier);
}

export function budgetCapMaxPerPerson(band: Pick<TripBudgetBand, "maxPerPerson">): number | null {
  if (band.maxPerPerson == null) return null;
  return Math.round(band.maxPerPerson * BUDGET_CAP_SLACK);
}

export function packagePricePerPersonEur(
  flightPartyEur: number,
  hotelStayEur: number,
  guests: number,
): number {
  const pax = Math.max(1, Math.round(guests));
  return (Math.max(0, flightPartyEur) + Math.max(0, hotelStayEur)) / pax;
}

export function hotelFitsPackageBudgetCap(opts: {
  hotelStayEur: number;
  flightPartyEur: number;
  guests: number;
  capMaxPerPerson: number | null;
}): boolean {
  if (opts.capMaxPerPerson == null) return true;
  return (
    packagePricePerPersonEur(opts.flightPartyEur, opts.hotelStayEur, opts.guests) <=
    opts.capMaxPerPerson + 1e-6
  );
}

/** Stay-total ceiling for Booking `price_max` (party, not per person). */
export function maxHotelStayEurForBudget(opts: {
  flightPartyEur: number;
  guests: number;
  capMaxPerPerson: number | null;
}): number | null {
  if (opts.capMaxPerPerson == null) return null;
  const stay = opts.capMaxPerPerson * Math.max(1, opts.guests) - Math.max(0, opts.flightPartyEur);
  if (stay <= 0) return 0;
  return Math.round(stay);
}
