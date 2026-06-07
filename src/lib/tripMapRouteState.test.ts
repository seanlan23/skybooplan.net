import { describe, expect, it } from "vitest";
import type { DayPlan } from "@/lib/aiPlan.functions";
import {
  buildFinalizedRouteDays,
  buildRouteFetchKey,
  isRouteDrawingReady,
} from "@/lib/tripMapRouteState";

function day(n: number, city: string): DayPlan {
  return {
    day: n,
    date: "2026-06-01",
    title: city,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 50,
    lat: 0,
    lng: 0,
    focusName: city,
    city,
  } as DayPlan;
}

describe("tripMapRouteState", () => {
  it("buildFinalizedRouteDays stops at first missing coord", () => {
    const coords = new Map<number, [number, number]>([
      [1, [14.5, 46.05]],
      [2, [12.3, 45.44]],
    ]);
    const finalized = buildFinalizedRouteDays(
      [day(1, "Ljubljana"), day(2, "Venice"), day(3, "Rome")],
      coords,
    );
    expect(finalized).toHaveLength(2);
  });

  it("route fetch key changes only when origin, destination, or coords change", () => {
    const days = [{ day: day(1, "A"), coord: [14.5, 46.05] as [number, number] }];
    const k1 = buildRouteFetchKey({
      origin: [14.5, 46.05],
      originLabel: "Ljubljana",
      destinationLabel: "Rome",
      finalizedDays: days,
    });
    const k2 = buildRouteFetchKey({
      origin: [14.5, 46.05],
      originLabel: "Ljubljana",
      destinationLabel: "Rome",
      finalizedDays: days,
    });
    expect(k1).toBe(k2);

    const k3 = buildRouteFetchKey({
      origin: [12.5, 41.9],
      originLabel: "Ljubljana",
      destinationLabel: "Rome",
      finalizedDays: days,
    });
    expect(k3).not.toBe(k1);
  });

  it("isRouteDrawingReady false while streaming incomplete", () => {
    expect(
      isRouteDrawingReady({
        streaming: true,
        expectedDayCount: 5,
        totalPlanDays: 2,
        finalizedCount: 2,
      }),
    ).toBe(false);
    expect(
      isRouteDrawingReady({
        streaming: true,
        expectedDayCount: 5,
        totalPlanDays: 5,
        finalizedCount: 5,
      }),
    ).toBe(true);
  });
});
