import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  hasContiguousDayNumbers,
  repairPlanDaySequence,
} from "@/lib/daySequence";

function day(partial: Partial<DayPlan> & { day: number }): DayPlan {
  return {
    title: `Day ${partial.day}`,
    city: partial.city ?? "Bangkok",
    lat: partial.lat ?? 13.75,
    lng: partial.lng ?? 100.5,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 80,
    ...partial,
  } as DayPlan;
}

describe("repairPlanDaySequence", () => {
  it("inserts missing day 5 between 4 and 6", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({ day: 1, city: "Bangkok" }),
        day({ day: 2, city: "Bangkok" }),
        day({ day: 3, city: "Ayutthaya" }),
        day({ day: 4, city: "Ayutthaya" }),
        day({ day: 6, city: "Chiang Mai" }),
        day({ day: 7, city: "Chiang Mai" }),
      ],
    } as AiTripPlan;

    const { inserted } = repairPlanDaySequence(plan, { language: "sl" });
    expect(inserted).toContain(5);
    expect(plan.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(plan.days.find((d) => d.day === 5)?.title).toMatch(/prosti|lokalni/i);
  });
});

describe("hasContiguousDayNumbers", () => {
  it("treats dayEnd spans as covered", () => {
    expect(
      hasContiguousDayNumbers([
        { day: 1 },
        { day: 2 },
        { day: 3, dayEnd: 4 },
        { day: 5 },
      ]),
    ).toBe(true);
  });

  it("detects a bare gap", () => {
    expect(hasContiguousDayNumbers([{ day: 1 }, { day: 2 }, { day: 4 }])).toBe(false);
  });
});
