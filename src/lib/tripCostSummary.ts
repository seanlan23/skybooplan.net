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
}): TripCostSummary {
  const planEur = Math.max(0, Math.round(opts.planEur));
  const flightEur = Math.max(0, Math.round(opts.flightTotalEur ?? 0));
  const overnight = estimateOvernightStay({
    dayCount: opts.dayCount,
    pax: opts.pax,
    countryCode: opts.countryCode,
    mode: opts.mode,
  });
  return {
    planEur,
    flightEur,
    grandTotalEur: planEur + flightEur,
    overnight,
  };
}

/** Hero cards are priced per adult; classic Duffel `price` is already party total. */
export function heroFlightPartyTotalEur(pricePerAdult: number, adults: number): number {
  return Math.max(0, Math.round(pricePerAdult * Math.max(1, adults)));
}
