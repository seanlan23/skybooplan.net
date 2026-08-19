import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { applyItineraryGuards } from "@/lib/itineraryGuards";
import {
  capSatelliteHubStays,
  dropDuplicateConsecutiveOutings,
  stripDestinationSightsOnTravelDays,
} from "@/lib/itineraryFacts";

function day(partial: Partial<DayPlan> & Pick<DayPlan, "day" | "city">): DayPlan {
  return {
    date: "2026-10-26",
    title: partial.city,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 50,
    lat: partial.lat ?? 0,
    lng: partial.lng ?? 0,
    focusName: partial.city,
    ...partial,
  } as DayPlan;
}

describe("itineraryFacts", () => {
  it("rewrites a second consecutive identical full-day outing and keeps the evening meal", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl",
      days: [
        day({
          day: 12,
          city: "Krabi",
          lat: 8.08,
          lng: 98.91,
          title: "Phi Phi in Maya Bay",
          activities: {
            morning: [
              {
                name: "Celodnevni izlet na Phi Phi otoke in Maya Bay",
                type: "ACTIVITY",
                description: "The Beach.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 13,
          city: "Krabi",
          lat: 8.08,
          lng: 98.91,
          title: "Celodnevni izlet na Koh Phi Phi in Maya Bay",
          activities: {
            morning: [
              {
                name: "Odhod s hitrim čolnom na Koh Phi Phi",
                type: "ACTIVITY",
                description: "Speedboat.",
              },
            ],
            afternoon: [
              {
                name: "Ogled Maya Bay in potapljanje z masko",
                type: "ACTIVITY",
                description: "The Beach.",
              },
            ],
            evening: [{ name: "Seafood v Ao Nang", type: "EAT", description: "Večerja." }],
          },
        }),
      ],
    } as AiTripPlan;
    dropDuplicateConsecutiveOutings(plan, "sl");
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Maya Bay|Phi Phi/i);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Hong Island/i);
    expect(plan.days[1]!.activities!.afternoon[0]!.name).toMatch(/Hong Island/i);
    expect(plan.days[1]!.activities!.evening[0]!.name).toMatch(/Seafood/i);
  });

  it("strips destination sights on a stacked ferry+van+flight morning", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl",
      days: [
        day({ day: 16, city: "Koh Lipe", lat: 6.48, lng: 99.31 }),
        day({
          day: 17,
          city: "Bangkok",
          lat: 13.75,
          lng: 100.5,
          transportation: [
            { type: "ferry", from: "Koh Lipe", to: "Pak Bara Pier", duration: "1.5–2h", estimatedPrice: 30 },
            { type: "van", from: "Pak Bara Pier", to: "Hat Yai (HDY)", duration: "1.5–2h", estimatedPrice: 12 },
            { type: "flight", from: "Hat Yai (HDY)", to: "Bangkok", duration: "1h–1h 20m", estimatedPrice: 55 },
          ],
          activities: {
            morning: [
              {
                name: "Prevoz iz Koh Lipeja v Bangkok",
                type: "TRANSPORT",
                description: "Čoln Pak Bara, kombi Hat Yai, let HDY → BKK.",
              },
              {
                name: "Siam Paragon / CentralWorld",
                type: "SIGHT",
                description: "Dopoldanski obisk, klimatizirano. BTS Siam.",
              },
            ],
            afternoon: [],
            evening: [{ name: "Večerja", type: "EAT", description: "Lokalna." }],
          },
        }),
      ],
    } as AiTripPlan;
    stripDestinationSightsOnTravelDays(plan);
    const slots = plan.days[1]!.activities!;
    expect(slots.morning.some((a) => /siam paragon/i.test(a.name))).toBe(false);
    expect(slots.morning.some((a) => /prevoz/i.test(a.name))).toBe(true);
    expect(slots.evening[0]!.name).toMatch(/Večerja/i);
  });

  it("caps a 3-night satellite next to a hub by extending the previous hub — days stay filled", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl",
      days: [
        day({
          day: 1,
          city: "Bangkok",
          lat: 13.756,
          lng: 100.502,
          activities: {
            morning: [{ name: "Grand Palace", type: "SIGHT", description: "Zjutraj." }],
            afternoon: [],
            evening: [],
          },
        }),
        day({ day: 2, city: "Bangkok", lat: 13.756, lng: 100.502 }),
        day({
          day: 3,
          city: "Ayutthaya",
          lat: 14.353,
          lng: 100.569,
          activities: {
            morning: [{ name: "Wat Mahathat", type: "SIGHT", description: "Ruševine." }],
            afternoon: [],
            evening: [{ name: "Večerja", type: "EAT", description: "Lokalna." }],
          },
        }),
        day({
          day: 4,
          city: "Ayutthaya",
          lat: 14.353,
          lng: 100.569,
          activities: {
            morning: [{ name: "Wat Phra Si Sanphet", type: "SIGHT", description: "Tempelj." }],
            afternoon: [],
            evening: [],
          },
        }),
        day({ day: 5, city: "Ayutthaya", lat: 14.353, lng: 100.569 }),
        day({ day: 6, city: "Chiang Mai", lat: 18.788, lng: 98.985 }),
        day({ day: 7, city: "Chiang Mai", lat: 18.788, lng: 98.985 }),
        day({ day: 8, city: "Chiang Mai", lat: 18.788, lng: 98.985 }),
      ],
    } as AiTripPlan;
    capSatelliteHubStays(plan);
    expect(plan.days.slice(0, 4).map((d) => d.city)).toEqual([
      "Bangkok",
      "Bangkok",
      "Bangkok",
      "Bangkok",
    ]);
    expect(plan.days[4]!.city).toBe("Ayutthaya");
    expect(plan.days.slice(5).every((d) => d.city === "Chiang Mai")).toBe(true);
    expect(plan.days[2]!.activities!.morning[0]!.name).toMatch(/Wat Mahathat/i);
    expect(plan.days[3]!.activities!.morning[0]!.name).toMatch(/Wat Phra Si Sanphet/i);
  });

  it("applyItineraryGuards keeps satellite extra nights as hub days, not empty prosti dan", () => {
    const plan = {
      destinationName: "Thailand",
      destinationIata: "BKK",
      contentLanguage: "sl",
      summary: "test",
      totalBudgetEur: 0,
      centerLat: 13.75,
      centerLng: 100.5,
      days: [
        day({ day: 1, city: "Bangkok", lat: 13.756, lng: 100.502 }),
        day({ day: 2, city: "Bangkok", lat: 13.756, lng: 100.502 }),
        day({
          day: 3,
          city: "Ayutthaya",
          lat: 14.353,
          lng: 100.569,
          activities: {
            morning: [{ name: "Wat Mahathat", type: "SIGHT", description: "Ruševine v Ayutthayi." }],
            afternoon: [],
            evening: [{ name: "Večerja ob reki", type: "EAT", description: "Lokalna." }],
          },
        }),
        day({
          day: 4,
          city: "Ayutthaya",
          lat: 14.353,
          lng: 100.569,
          activities: {
            morning: [{ name: "Wat Phra Si Sanphet", type: "SIGHT", description: "Tempelj." }],
            afternoon: [],
            evening: [],
          },
        }),
        day({ day: 5, city: "Ayutthaya", lat: 14.353, lng: 100.569 }),
        day({ day: 6, city: "Chiang Mai", lat: 18.788, lng: 98.985 }),
        day({ day: 7, city: "Chiang Mai", lat: 18.788, lng: 98.985 }),
        day({ day: 8, city: "Chiang Mai", lat: 18.788, lng: 98.985 }),
      ],
    } as AiTripPlan;
    applyItineraryGuards(plan, { language: "sl" });
    const cities = plan.days.map((d) => d.city);
    expect(cities.filter((c) => c === "Ayutthaya")).toHaveLength(1);
    expect(cities.filter((c) => c === "Bangkok").length).toBeGreaterThanOrEqual(4);
    expect(cities.filter((c) => c === "Chiang Mai")).toHaveLength(3);
    const filled = plan.days.filter((d) => d.city === "Bangkok" && d.day >= 3 && d.day <= 4);
    for (const d of filled) {
      const acts = [
        ...(d.activities?.morning ?? []),
        ...(d.activities?.afternoon ?? []),
        ...(d.activities?.evening ?? []),
      ];
      expect(acts.length).toBeGreaterThan(0);
    }
  });
});
