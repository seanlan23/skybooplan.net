import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { scrubImpossibleIslandDayTrips } from "@/lib/islandHopGuard";
import { dropDuplicateConsecutiveOutings } from "@/lib/itineraryFacts";

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

  it("rewrites a second consecutive Maya Bay day from Ao Nang to Hong Island", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl",
      days: [
        {
          day: 12,
          city: "Krabi",
          title: "Phi Phi in Maya Bay",
          activities: {
            morning: [
              { name: "Celodnevni izlet na Phi Phi otoke in Maya Bay", type: "ACTIVITY", description: "The Beach." },
            ],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 13,
          city: "Krabi",
          title: "Celodnevni izlet na Koh Phi Phi in Maya Bay",
          activities: {
            morning: [
              { name: "Odhod s hitrim čolnom na Koh Phi Phi", type: "ACTIVITY", description: "Speedboat." },
            ],
            afternoon: [
              { name: "Ogled Maya Bay in potapljanje z masko", type: "ACTIVITY", description: "The Beach." },
            ],
            evening: [{ name: "Seafood v Ao Nang", type: "EAT", description: "Večerja." }],
          },
        },
      ],
    } as AiTripPlan;
    dropDuplicateConsecutiveOutings(plan, "sl");
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Maya Bay|Phi Phi/i);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Hong Island/i);
    expect(plan.days[1]!.activities!.afternoon[0]!.name).toMatch(/Hong Island/i);
    expect(plan.days[1]!.activities!.evening[0]!.name).toMatch(/Seafood/i);
  });
});
