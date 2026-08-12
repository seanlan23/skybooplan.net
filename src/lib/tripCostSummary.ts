import {
  estimateOvernightStay,
  type OvernightEstimate,
} from "@/lib/overnightEstimate";

export type TripCostSummary = {
  /** Daily plan total (meals, sights, local transport, fuel/toll/camp share…). */
  planEur: number;
  /** Selected flight offer total for the whole party (0 if none). */
  flightEur: number;
  /** plan + flights — shown as the main TOTAL. */
  grandTotalEur: number;
  overnight: OvernightEstimate;
};

export function buildTripCostSummary(opts: {
  planEur: number;
  flightTotalEur?: number | null;
  dayCount: number;
  pax: number;
  countryCode?: string;
  mode: "hotel" | "car" | "motorhome";
  unpaidNights?: number;
}): TripCostSummary {
  const planEur = Math.max(0, Math.round(opts.planEur));
  const flightEur = Math.max(0, Math.round(opts.flightTotalEur ?? 0));
  const overnight = estimateOvernightStay({
    dayCount: opts.dayCount,
    pax: opts.pax,
    countryCode: opts.countryCode,
    mode: opts.mode,
    unpaidNights: opts.unpaidNights,
  });
  return {
    planEur,
    flightEur,
    grandTotalEur: planEur + flightEur,
    overnight,
  };
}

/**
 * Party total for the selected hero flight.
 * Duffel cards use `price_basis: party_total` (do not multiply).
 * Legacy Make cards are per-adult.
 */
export function heroFlightPartyTotalEur(
  priceEur: number,
  adults: number,
  priceBasis?: "per_adult" | "party_total",
): number {
  if (priceBasis === "party_total") return Math.max(0, Math.round(priceEur));
  return Math.max(0, Math.round(priceEur * Math.max(1, adults)));
}
