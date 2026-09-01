import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { sortDepartureDayChronology, type DepartureDaySortOpts } from "@/lib/departureDaySort";
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
  enforceTripBaseCap(plan, { calendarDays: opts?.calendarDays });
  sortDepartureDayChronology(plan, opts);
  return plan;
}
