import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  buildHubStayModules,
  stripScheduleNoise,
  usesHubStayGuide,
} from "@/lib/hubStayModules";

function day(n: number, city: string, extra?: Partial<DayPlan>): DayPlan {
  return {
    day: n,
    date: `2026-07-${String(n).padStart(2, "0")}`,
    title: city,
    city,
    focusName: city,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 40,
    lat: 0,
    lng: 0,
    category: "activity",
    ...extra,
  };
}

function plan(days: DayPlan[], extra?: Partial<AiTripPlan>): AiTripPlan {
  return {
    destinationName: "Bali",
    summary: "test",
    totalBudgetEur: 0,
    centerLat: 0,
    centerLng: 0,
    tripStyle: "explorer",
    originIata: "MUC",
    destinationIata: "DPS",
    days,
    ...extra,
  };
}

describe("usesHubStayGuide", () => {
  it("is on for explorer flights and off for road / resort", () => {
    expect(usesHubStayGuide(plan([day(1, "Ubud")]))).toBe(true);
    expect(usesHubStayGuide(plan([day(1, "Split")], { tripStyle: "roadtrip" }))).toBe(false);
    expect(
      usesHubStayGuide(plan([day(1, "Split")], { groundTransportMode: "car" })),
    ).toBe(false);
    expect(usesHubStayGuide({ tripStyle: "single_base", days: [], resortStay: {} })).toBe(
      false,
    );
  });
});

describe("buildHubStayModules", () => {
  it("groups consecutive sleep cities and drops clocks from highlights", () => {
    const hubs = buildHubStayModules(
      plan([
        day(1, "Ubud", {
          activities: {
            morning: [
              {
                name: "09:00 Rice terraces",
                description: "Tegallalang at 09:00",
                type: "SIGHT",
                estimatedCostEur: 8,
              },
            ],
          },
          localTips: "Najemi skuter v središču Ubuda, ne pri hotelu ob cesti.",
        }),
        day(2, "Ubud", {
          activities: {
            afternoon: [{ name: "Celodnevni izlet na Nusa Penida", type: "ACTIVITY" }],
          },
        }),
        day(3, "Ubud"),
        day(4, "Ubud"),
        day(5, "Nusa Lembongan", {
          transportation: [
            {
              type: "ferry",
              from: "Padang Bai",
              to: "Nusa Lembongan",
              duration: "45 min",
              estimatedPrice: 25,
            },
          ],
          activities: {
            morning: [{ name: "Snorkeling", type: "BEACH", estimatedCostEur: 20 }],
          },
        }),
        day(6, "Nusa Lembongan"),
        day(7, "Nusa Lembongan"),
        day(8, "Uluwatu", {
          activities: {
            evening: [{ name: "Uluwatu temple", type: "SIGHT" }],
          },
        }),
        day(9, "Uluwatu"),
        day(10, "Uluwatu"),
        day(11, "Uluwatu"),
      ]),
    );

    expect(hubs.map((h) => h.cityName)).toEqual(["Ubud", "Nusa Lembongan", "Uluwatu"]);
    expect(hubs[0]?.nights).toBeGreaterThanOrEqual(3);
    expect(hubs[0]?.highlights.some((h) => /rice terraces/i.test(h.title))).toBe(true);
    expect(hubs[0]?.highlights.every((h) => !/\d{1,2}:\d{2}/.test(h.title))).toBe(true);
    expect(hubs[0]?.highlights.some((h) => h.kind === "daytrip")).toBe(true);
    expect(hubs[1]?.transferIn.summary).toMatch(/ferry|Nusa Lembongan/i);
    expect(hubs[0]?.localTips).toMatch(/skuter/i);
  });

  it("strips clock labels from copied text", () => {
    expect(stripScheduleNoise("09:00 Temple walk DOPOLDAN")).toBe("Temple walk");
  });
});
