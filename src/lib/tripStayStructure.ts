import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  sortDepartureDayChronology,
  stripPrematureDepartureLogistics,
  type DepartureDaySortOpts,
} from "@/lib/departureDaySort";
import { alignDayCityToActivities } from "@/lib/itineraryCityAlign";
import { sanitizePlanDayCities, stampLastDayReturnFlightClock } from "@/lib/itinerarySanitize";
import {
  holdCityHeaderUntilTransfer,
  syncDayCityToDaytimeProgram,
} from "@/lib/overnightHotelStays";
import { enforceTripBaseCap } from "@/lib/tripBaseCap";
import { isSingleBasePlan } from "@/lib/tripStyle";

export type StabilizeTripStayOpts = DepartureDaySortOpts & {
  calendarDays?: number;
};

/**
 * Code (not prompt) stay structure: cap hotel bases, then sort departure-day clocks.
 * Idempotent. Skips resort/single-base plans. Explicit stay plans skip only the cap.
 */
export function stabilizeTripStayStructure(
  plan: AiTripPlan,
  opts?: StabilizeTripStayOpts,
): AiTripPlan {
  if (isSingleBasePlan(plan)) return plan;
  syncDayCityToDaytimeProgram(plan.days ?? []);
  holdCityHeaderUntilTransfer(plan.days ?? []);
  enforceTripBaseCap(plan, { calendarDays: opts?.calendarDays });
  sanitizePlanDayCities(plan);
  alignDayCityToActivities(plan);
  stripPrematureDepartureLogistics(plan, opts);
  sortDepartureDayChronology(plan, opts);
  stampLastDayReturnFlightClock(plan, {
    inboundDepart: opts?.inboundDepart,
    returnTime: opts?.inboundDepart,
  });
  return plan;
}
