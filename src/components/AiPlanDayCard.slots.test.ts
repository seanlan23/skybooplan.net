import { describe, expect, it } from "vitest";
import { getSlotActivities } from "@/components/AiPlanDayCard";
import type { DayPlan } from "@/lib/aiPlan.functions";

describe("getSlotActivities", () => {
  it("does not resurrect legacy afternoon text when activities.afternoon is empty", () => {
    const day = {
      day: 1,
      date: "2026-10-26",
      title: "Odhod",
      morning: "",
      afternoon: "Siesta / bazen: Tropska pavza 13:00–16:00",
      evening: "",
      dailyBudgetEur: 0,
      lat: 48.35,
      lng: 11.78,
      city: "Munich",
      activities: {
        morning: [{ name: "Mednarodni let", type: "TRANSPORT" }],
        afternoon: [],
        evening: [],
      },
    } as DayPlan;

    expect(getSlotActivities(day, "afternoon")).toEqual([]);
    expect(getSlotActivities(day, "morning").map((a) => a.name)).toEqual(["Mednarodni let"]);
  });
});
