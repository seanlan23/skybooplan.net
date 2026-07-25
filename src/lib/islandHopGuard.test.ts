import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { scrubImpossibleIslandDayTrips } from "@/lib/islandHopGuard";

function phPlan(): AiTripPlan {
  return {
    destinationName: "Philippines",
    summary: "test",
    contentLanguage: "en",
    totalBudgetEur: 0,
    centerLat: 11.96,
    centerLng: 121.92,
    destinationIata: "MPH",
    days: [
      {
        day: 18,
        date: "2026-11-09",
        title: "Boracay: escursione a Malapascua",
        morning: "",
        afternoon: "",
        evening: "",
        travelHack: "",
        transportationTips: "",
        localWarnings: "",
        dailyBudgetEur: 75,
        lat: 11.96,
        lng: 121.92,
        focusName: "Boracay",
        city: "Boracay",
        category: "beach",
        activities: {
          morning: [
            {
              name: "Day trip a Malapascua (un po' distante)",
              type: "ACTIVITY",
              description:
                "Escursione giornaliera a Malapascua — un po' distante ma fattibile.",
            },
          ],
          afternoon: [],
          evening: [],
        },
      },
    ],
  };
}

describe("scrubImpossibleIslandDayTrips", () => {
  it("rewrites Boracay→Malapascua same-day hop", () => {
    const plan = phPlan();
    scrubImpossibleIslandDayTrips(plan, "it");
    const act = plan.days[0]!.activities!.morning![0]!;
    expect(act.name).not.toMatch(/Malapascua/i);
    expect(act.description).toMatch(/non è raggiungibile|not reachable/i);
    expect(act.name).toMatch(/Boracay/i);
  });
});
