import { describe, expect, it } from "vitest";
import { findDuplicateCitySegments } from "@/lib/planValidation";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";

function day(p: Partial<DayPlan> & { day: number; city: string }): DayPlan {
  return {
    title: p.city,
    morning: "",
    afternoon: "",
    evening: "",
    lat: p.lat ?? 40,
    lng: p.lng ?? -3,
    focusName: p.city,
    category: "sight",
    ...p,
  };
}

function plan(days: DayPlan[]): AiTripPlan {
  return {
    destinationName: "Spain",
    summary: "",
    totalBudgetEur: 0,
    centerLat: 40,
    centerLng: -3,
    days,
  };
}

describe("Spain Gibraltar return route", () => {
  it("allows Barcelona → Gibraltar → Madrid → Barcelona (Madrid once)", () => {
    const days: DayPlan[] = [
      ...[1, 2, 3].map((d) => day({ day: d, city: "Barcelona", lat: 41.39, lng: 2.17 })),
      ...[4, 5].map((d) => day({ day: d, city: "Seville", lat: 37.39, lng: -5.98 })),
      ...[6, 7].map((d) => day({ day: d, city: "Gibraltar", lat: 36.14, lng: -5.35 })),
      ...[8, 9].map((d) => day({ day: d, city: "Madrid", lat: 40.42, lng: -3.7 })),
      ...[10, 11, 12].map((d) => day({ day: d, city: "Barcelona", lat: 41.39, lng: 2.17 })),
    ];
    expect(findDuplicateCitySegments(plan(days))).toEqual([]);
  });

  it("allows Madrid pickup + return for 14-day MAD motorhome loop", () => {
    const days: DayPlan[] = [
      ...[1, 2].map((d) => day({ day: d, city: "Madrid", lat: 40.42, lng: -3.7 })),
      ...[3, 4, 5].map((d) => day({ day: d, city: "Barcelona", lat: 41.39, lng: 2.17 })),
      ...[6, 7].map((d) => day({ day: d, city: "Valencia", lat: 39.47, lng: -0.38 })),
      ...[8, 9].map((d) => day({ day: d, city: "Gibraltar", lat: 36.14, lng: -5.35 })),
      ...[10, 11, 12, 13, 14].map((d) => day({ day: d, city: "Madrid", lat: 40.42, lng: -3.7 })),
    ];
    expect(findDuplicateCitySegments(plan(days))).toEqual([]);
  });

  it("flags Madrid visited twice (outbound and return)", () => {
    const days: DayPlan[] = [
      day({ day: 1, city: "Barcelona", lat: 41.39, lng: 2.17 }),
      day({ day: 2, city: "Madrid", lat: 40.42, lng: -3.7 }),
      day({ day: 3, city: "Gibraltar", lat: 36.14, lng: -5.35 }),
      day({ day: 4, city: "Madrid", lat: 40.42, lng: -3.7 }),
      day({ day: 5, city: "Barcelona", lat: 41.39, lng: 2.17 }),
    ];
    const v = findDuplicateCitySegments(plan(days));
    expect(v.some((x) => x.rule === "duplicate_destination_segment")).toBe(true);
  });
});
