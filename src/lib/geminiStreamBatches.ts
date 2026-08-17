import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { computeTripTotalBudgetEur } from "@/lib/tripBudget";
import { dedupePlanDaysByNumber } from "@/lib/geminiPlanMap";

export function planVisitedCities(plan: AiTripPlan | null | undefined): string[] {
  if (!plan?.days?.length) return [];
  const cities: string[] = [];
  let last = "";
  for (const d of plan.days) {
    const city = (d.city ?? "").trim();
    if (!city) continue;
    if (city.toLowerCase() === last.toLowerCase()) continue;
    cities.push(city);
    last = city;
  }
  return cities;
}

export function planLastCity(plan: AiTripPlan | null | undefined): string | undefined {
  const days = plan?.days;
  if (!days?.length) return undefined;
  const city = days[days.length - 1]?.city?.trim();
  return city || undefined;
}

/**
 * Keep days in [start, end]. If Gemini restarted numbering at 1, shift onto the window.
 */
export function alignBatchDays(
  plan: AiTripPlan,
  range: { start: number; end: number },
): AiTripPlan {
  const sorted = [...(plan.days ?? [])].sort((a, b) => a.day - b.day);
  if (!sorted.length) return { ...plan, days: [] };

  const inRange = sorted.filter((d) => d.day >= range.start && d.day <= range.end);
  if (inRange.length) return { ...plan, days: inRange };

  const min = sorted[0]!.day;
  const shifted = sorted
    .map((d) => ({ ...d, day: d.day - min + range.start }))
    .filter((d) => d.day >= range.start && d.day <= range.end);
  return { ...plan, days: shifted };
}

export function mergeStreamedTripPlans(
  base: AiTripPlan | null,
  incoming: AiTripPlan,
  pax = 1,
): AiTripPlan {
  if (!base?.days.length) return incoming;
  if (!incoming.days.length) return base;

  const days = dedupePlanDaysByNumber([...base.days, ...incoming.days]);
  const destinationName =
    incoming.destinationName.trim().length > base.destinationName.trim().length
      ? incoming.destinationName
      : base.destinationName;
  const summary =
    (incoming.summary?.trim().length ?? 0) > (base.summary?.trim().length ?? 0)
      ? incoming.summary
      : base.summary;

  return {
    ...base,
    ...incoming,
    destinationName,
    summary,
    days,
    totalBudgetEur: computeTripTotalBudgetEur(days, pax) || incoming.totalBudgetEur || base.totalBudgetEur,
    travelRequirements: incoming.travelRequirements ?? base.travelRequirements,
    weatherWidget: incoming.weatherWidget ?? base.weatherWidget,
    safetyWarning:
      incoming.safetyWarning !== undefined ? incoming.safetyWarning : base.safetyWarning,
    centerLat: incoming.centerLat || base.centerLat,
    centerLng: incoming.centerLng || base.centerLng,
  };
}

export function maxPlanDayNumber(days: DayPlan[] | undefined): number {
  if (!days?.length) return 0;
  return days.reduce((max, d) => Math.max(max, d.day), 0);
}
