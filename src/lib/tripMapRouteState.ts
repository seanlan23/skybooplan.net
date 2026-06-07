import type { DayPlan } from "@/lib/aiPlan.functions";

export type RouteDayStop = { day: DayPlan; coord: [number, number] };

/** Consecutive days from 1 with resolved coords; stops at first gap. */
export function buildFinalizedRouteDays(
  days: DayPlan[],
  dayCoords: Map<number, [number, number]>,
): RouteDayStop[] {
  const sorted = [...days].sort((a, b) => a.day - b.day);
  const out: RouteDayStop[] = [];

  for (const d of sorted) {
    if (d.day !== out.length + 1) break;
    const coord = dayCoords.get(d.day);
    if (!coord) break;
    out.push({ day: d, coord });
  }

  return out;
}

export function isRouteDrawingReady(opts: {
  streaming: boolean;
  expectedDayCount: number;
  totalPlanDays: number;
  finalizedCount: number;
}): boolean {
  if (opts.finalizedCount === 0) return false;
  if (!opts.streaming) {
    return opts.finalizedCount >= opts.totalPlanDays;
  }
  if (opts.expectedDayCount <= 0) return false;
  return (
    opts.totalPlanDays >= opts.expectedDayCount &&
    opts.finalizedCount >= opts.expectedDayCount
  );
}

export function buildRouteFetchKey(opts: {
  origin: [number, number] | null;
  originLabel: string;
  destinationLabel: string;
  finalizedDays: RouteDayStop[];
}): string | null {
  if (!opts.origin && !opts.originLabel.trim()) return null;
  if (opts.finalizedDays.length === 0) return null;

  const originPart = opts.origin
    ? `${opts.origin[0].toFixed(4)},${opts.origin[1].toFixed(4)}`
    : opts.originLabel.trim();

  const destPart = opts.destinationLabel.trim();
  const daysPart = opts.finalizedDays
    .map((d) => `${d.day}:${d.coord[0].toFixed(4)},${d.coord[1].toFixed(4)}`)
    .join("|");

  return `${originPart}::${destPart}::${daysPart}`;
}
