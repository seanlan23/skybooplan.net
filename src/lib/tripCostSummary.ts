import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { resolveDayBudgetCountry } from "@/lib/countryDailyBudget";
import type { TripFlightContext } from "@/lib/flightScheduling";
import { hotelStayDatesFromFlight } from "@/lib/hotelStayDates";
import {
  estimateOvernightStay,
  overnightPlaceHint,
  resolveStayNights,
  type OvernightEstimate,
} from "@/lib/overnightEstimate";
import { countHomeboundUnpaidNights } from "@/lib/roadTripLogistics";
import { computeTripTotalBudgetEur } from "@/lib/tripBudget";

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
  place?: string;
  iata?: string;
  mode: "hotel" | "car" | "motorhome";
  unpaidNights?: number;
  nights?: number;
}): TripCostSummary {
  const planEur = Math.max(0, Math.round(opts.planEur));
  const flightEur = Math.max(0, Math.round(opts.flightTotalEur ?? 0));
  const overnight = estimateOvernightStay({
    dayCount: opts.dayCount,
    pax: opts.pax,
    countryCode: opts.countryCode,
    place: opts.place,
    iata: opts.iata,
    mode: opts.mode,
    unpaidNights: opts.unpaidNights,
    nights: opts.nights,
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
 * Legacy Make cards are per-adult — multiply by the whole travelling party.
 */
export function heroFlightPartyTotalEur(
  priceEur: number,
  travelers: number,
  priceBasis?: "per_adult" | "party_total",
): number {
  if (priceBasis === "party_total") return Math.max(0, Math.round(priceEur));
  return Math.max(0, Math.round(priceEur * Math.max(1, travelers)));
}

export function stampFlightTotalOnPlan(
  plan: AiTripPlan,
  flightTotalEur?: number | null,
): AiTripPlan {
  const motorhome =
    plan.groundTransportMode === "motorhome" || plan.accommodationMode === "motorhome";
  if (motorhome) {
    if (plan.flightTotalEur == null) return plan;
    return { ...plan, flightTotalEur: undefined };
  }
  const n = Math.max(0, Math.round(flightTotalEur ?? 0));
  if (n <= 0) return plan;
  if (plan.flightTotalEur === n) return plan;
  return { ...plan, flightTotalEur: n };
}

/** Same numbers as the plan header TOTAL — destination spend + selected tickets. */
export function summarizeAiTripCosts(
  plan: AiTripPlan,
  opts: {
    pax: number;
    flightTotalEur?: number | null;
    destinationIata?: string;
    departDate?: string;
    returnDate?: string;
    flights?: TripFlightContext;
  },
): TripCostSummary {
  const pax = Math.max(1, opts.pax);
  const motorhome =
    plan.groundTransportMode === "motorhome" || plan.accommodationMode === "motorhome";
  const car = plan.groundTransportMode === "car";
  const destIata = opts.destinationIata ?? plan.destinationIata;
  const planEur =
    plan.totalBudgetEur > 0
      ? plan.totalBudgetEur
      : computeTripTotalBudgetEur(plan.days ?? [], pax);
  const flightEur = motorhome
    ? 0
    : (opts.flightTotalEur ?? plan.flightTotalEur ?? 0);
  const hotel = plan.hotels?.[0];
  const stay = hotelStayDatesFromFlight({
    departDate: opts.departDate,
    returnDate: opts.returnDate,
    outboundArriveDate: opts.flights?.outboundArriveDate,
    outboundArriveDayOffset: opts.flights?.outboundArriveDayOffset,
    outboundDepart: opts.flights?.outboundDepart,
    outboundArrive: opts.flights?.outboundArrive,
    inboundDepartDate: opts.flights?.inboundDepartDate,
  });
  const fromDate = stay?.checkIn || hotel?.from_date || opts.departDate || plan.days[0]?.date;
  const toDate = stay?.checkOut || hotel?.to_date || opts.returnDate;
  const resortNights =
    plan.resortStay || plan.tripStyle === "single_base"
      ? resolveStayNights({
          hotelNights: fromDate && toDate ? undefined : hotel?.nights,
          fromDate,
          toDate,
        })
      : undefined;
  return buildTripCostSummary({
    planEur,
    flightTotalEur: flightEur,
    dayCount: plan.days?.length ?? 0,
    pax,
    countryCode: resolveDayBudgetCountry({
      destinationName: plan.destinationName,
      destinationIata: destIata,
    }),
    place: overnightPlaceHint({
      destinationName: plan.destinationName,
      destinationPlace: plan.destinationPlace,
      destinationIata: destIata,
      dayCities: (plan.days ?? []).map((d) => d.city),
    }),
    iata: destIata,
    mode: motorhome ? "motorhome" : car ? "car" : "hotel",
    unpaidNights: car || motorhome ? countHomeboundUnpaidNights(plan) : 0,
    nights: resortNights,
  });
}

/** Overlay cost fields so PDF / saved itineraries keep the labeled split. */
export function itineraryWithTripCosts(plan: AiTripPlan, cost: TripCostSummary): AiTripPlan & {
  planEur: number;
  flightEur: number;
  staysApproxEur: number;
} {
  return {
    ...plan,
    totalBudgetEur: cost.grandTotalEur,
    flightTotalEur: cost.flightEur > 0 ? cost.flightEur : plan.flightTotalEur,
    planEur: cost.planEur,
    flightEur: cost.flightEur,
    staysApproxEur: cost.overnight.totalEur,
  };
}
