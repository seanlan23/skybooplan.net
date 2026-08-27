import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";

function planCalendarDayCount(days: Array<{ day: number }>): number {
  if (!days.length) return 0;
  return Math.max(...days.map((d) => d.day));
}

function dayActivityScore(day: DayPlan): number {
  const a = day.activities;
  if (!a) return day.mapPins?.length ?? 0;
  return (
    (a.morning?.length ?? 0) +
    (a.afternoon?.length ?? 0) +
    (a.evening?.length ?? 0) +
    (day.mapPins?.length ?? 0)
  );
}

function dedupeDays(days: DayPlan[]): DayPlan[] {
  const byDay = new Map<number, DayPlan>();
  for (const d of days) {
    const prev = byDay.get(d.day);
    if (!prev || dayActivityScore(d) > dayActivityScore(prev)) {
      byDay.set(d.day, d);
    }
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

export function isoPlusDays(iso: string | undefined, add: number): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}

/**
 * Do not invent calendar days. Only drop extras beyond N.
 */
export function expandPlanDaysToExpected(
  plan: AiTripPlan,
  opts: { expectedDays: number; language?: string; departDate?: string },
): { inserted: number[] } {
  plan.days = dedupeDays(plan.days ?? []);
  if (!plan.days.length || opts.expectedDays <= 0) return { inserted: [] };
  trimPlanDaysToExpected(plan, opts.expectedDays);
  if (opts.departDate) resyncPlanDayDates(plan, opts.departDate);
  return { inserted: [] };
}

/** Drop Gemini extras beyond N so Day N stays the departure day. */
export function trimPlanDaysToExpected(
  plan: AiTripPlan,
  expectedDays: number,
): number {
  if (!plan.days?.length || expectedDays <= 0) return 0;
  const before = plan.days.length;
  plan.days = plan.days.filter((d) => d.day <= expectedDays);
  return before - plan.days.length;
}

/**
 * Deduplicate day numbers. Do not invent placeholder days.
 */
export function repairPlanDaySequence(
  plan: AiTripPlan,
  opts?: { expectedDays?: number; language?: string; departDate?: string },
): { inserted: number[] } {
  plan.days = dedupeDays(plan.days ?? []);
  if (opts?.departDate) resyncPlanDayDates(plan, opts.departDate);
  return { inserted: [] };
}

/**
 * Authoritative calendar: day N is always departDate + (N-1).
 * Gemini ISO stamps are ignored once we know the trip start (fixes duplicate 31 Oct / skipped 6 Nov).
 */
export function resyncPlanDayDates(plan: AiTripPlan, departDate?: string): number {
  const base =
    (departDate ?? plan.days?.find((d) => d.day === 1)?.date)?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!base) return 0;
  let n = 0;
  for (const day of plan.days ?? []) {
    if (typeof day.day !== "number" || day.day < 1) continue;
    const next = isoPlusDays(base, day.day - 1);
    if (!next || day.date === next) continue;
    day.date = next;
    n += 1;
  }
  return n;
}

/** True when every integer from 1…max(day) exists (island dayEnd spans still count as their start day). */
export function hasContiguousDayNumbers(days: Array<{ day: number; dayEnd?: number }>): boolean {
  if (!days.length) return false;
  const covered = new Set<number>();
  for (const d of days) {
    const end = d.dayEnd != null && d.dayEnd > d.day ? d.dayEnd : d.day;
    for (let n = d.day; n <= end; n++) covered.add(n);
  }
  const max = Math.max(...covered);
  for (let n = 1; n <= max; n++) {
    if (!covered.has(n)) return false;
  }
  return true;
}
