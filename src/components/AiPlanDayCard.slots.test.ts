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
        morning: [{ name: "Mednarodni let", type: "TRANSPORT", description: "Let iz Münchna." }],
        afternoon: [],
        evening: [],
      },
    } as DayPlan;

    expect(getSlotActivities(day, "afternoon")).toEqual([]);
    expect(getSlotActivities(day, "morning").map((a) => a.name)).toEqual(["Mednarodni let"]);
  });

  it("omits a structured evening slot that has a title but no description", () => {
    const day = {
      day: 2,
      date: "2026-10-27",
      title: "Pariz",
      morning: "",
      afternoon: "",
      evening: "",
      dailyBudgetEur: 80,
      lat: 48.85,
      lng: 2.35,
      city: "Paris",
      activities: {
        morning: [
          {
            name: "Sprehod ob Seni",
            description:
              "Začni pri Notre-Dame parvisu in preči most do Sainte-Chapelle, da se izogneš vrsti.",
          },
        ],
        afternoon: [],
        evening: [{ name: "Večerja v bistroju" }],
      },
    } as DayPlan;

    expect(getSlotActivities(day, "evening")).toEqual([]);
    expect(getSlotActivities(day, "morning")).toHaveLength(1);
  });

  it("omits evening when name and description are both the slot label", () => {
    const day = {
      day: 2,
      date: "2026-10-18",
      title: "Pariz",
      morning: "",
      afternoon: "",
      evening: "Večer: Večer",
      dailyBudgetEur: 80,
      lat: 48.85,
      lng: 2.35,
      city: "Paris",
      activities: {
        morning: [],
        afternoon: [],
        evening: [{ name: "Večer", description: "Večer" }],
      },
    } as DayPlan;

    expect(getSlotActivities(day, "evening")).toEqual([]);
  });
});
