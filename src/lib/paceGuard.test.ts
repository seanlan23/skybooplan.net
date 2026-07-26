import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  enforceTravelPace,
  isPaceLightDay,
  isPaceProgramActivity,
} from "@/lib/paceGuard";

function day(partial: Partial<DayPlan> & { day: number }): DayPlan {
  return {
    title: `Day ${partial.day}`,
    city: partial.city ?? "Sydney",
    lat: -33.86,
    lng: 151.21,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 100,
    ...partial,
  } as DayPlan;
}

describe("enforceTravelPace", () => {
  it("is a no-op without explicit pace (legacy / showcase safe)", () => {
    const plan = {
      destinationName: "Sydney",
      days: [
        day({
          day: 2,
          activities: {
            morning: [
              { name: "Opera House", type: "SIGHT", description: "Tour." },
              { name: "Bridge walk", type: "SIGHT", description: "Pylon." },
            ],
            afternoon: [
              { name: "Botanic Garden", type: "NATURE", description: "Walk." },
              { name: "Café break", type: "ACTIVITY", description: "Pavza v kavarni." },
            ],
            evening: [{ name: "Dinner", type: "EAT", description: "Večerja." }],
          },
        }),
      ],
    } as AiTripPlan;

    expect(enforceTravelPace(plan)).toBe(0);
    expect(plan.days[0]!.activities!.afternoon).toHaveLength(2);
  });

  it("trims calm full days to 2 program activities and keeps meal + transport", () => {
    const plan = {
      destinationName: "Sydney",
      travelPace: "calm",
      days: [
        day({
          day: 2,
          activities: {
            morning: [
              { name: "Opera House", type: "SIGHT", description: "Guided tour of the icon." },
              {
                name: "Pavza v kavarni",
                type: "ACTIVITY",
                description: "Café break after walking.",
              },
            ],
            afternoon: [
              { name: "Botanic Garden", type: "NATURE", description: "Harbour views and lawns." },
              { name: "Hyde Park stroll", type: "ACTIVITY", description: "Short city walk." },
            ],
            evening: [{ name: "Večerja", type: "EAT", description: "Ena večerja." }],
          },
        }),
      ],
    } as AiTripPlan;

    const removed = enforceTravelPace(plan, { pace: "calm" });
    expect(removed).toBeGreaterThanOrEqual(2);
    const program = ["morning", "afternoon", "evening"].flatMap((s) =>
      (plan.days[0]!.activities![s as "morning"] ?? []).filter(isPaceProgramActivity),
    );
    expect(program).toHaveLength(2);
    expect(plan.days[0]!.activities!.evening).toHaveLength(1);
    expect(plan.days[0]!.activities!.evening![0]!.type).toBe("EAT");
    expect(program.map((a) => a.name).join(" ")).toMatch(/Opera|Botanic/i);
  });

  it("keeps at most 1 program item on arrival / long-drive light days", () => {
    const plan = {
      destinationName: "Road",
      travelPace: "relaxed",
      days: [
        day({
          day: 1,
          category: "transport",
          drivingDistanceKm: 320,
          drivingDurationHours: "4h 30m",
          activities: {
            morning: [
              {
                name: "Prihod na letališče in transfer",
                type: "TRANSPORT",
                description: "Airport arrival and hotel transfer.",
              },
            ],
            afternoon: [
              { name: "Old town walk", type: "SIGHT", description: "Historic centre." },
              { name: "Museum visit", type: "SIGHT", description: "Local museum." },
            ],
            evening: [{ name: "Dinner", type: "EAT", description: "Večerja." }],
          },
        }),
      ],
    } as AiTripPlan;

    expect(isPaceLightDay(plan.days[0]!, { arrivalDay: 1, totalDays: 5 })).toBe(true);
    enforceTravelPace(plan, { pace: "relaxed", arrivalDay: 1 });
    const program = ["morning", "afternoon", "evening"].flatMap((s) =>
      (plan.days[0]!.activities![s as "morning"] ?? []).filter(isPaceProgramActivity),
    );
    expect(program).toHaveLength(1);
    expect(plan.days[0]!.activities!.morning![0]!.type).toBe("TRANSPORT");
    expect(plan.days[0]!.activities!.evening![0]!.type).toBe("EAT");
  });

  it("does not trim intensive plans", () => {
    const plan = {
      destinationName: "NYC",
      travelPace: "intensive",
      days: [
        day({
          day: 3,
          activities: {
            morning: [
              { name: "MoMA", type: "SIGHT", description: "Art." },
              { name: "Fifth Ave", type: "ACTIVITY", description: "Walk." },
            ],
            afternoon: [
              { name: "Central Park", type: "NATURE", description: "Park." },
              { name: "Met", type: "SIGHT", description: "Museum." },
            ],
            evening: [{ name: "Dinner", type: "EAT", description: "Dinner." }],
          },
        }),
      ],
    } as AiTripPlan;

    expect(enforceTravelPace(plan, { pace: "intensive" })).toBe(0);
    expect(plan.days[0]!.activities!.afternoon).toHaveLength(2);
  });
});
