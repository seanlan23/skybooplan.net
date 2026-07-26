import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  alignTransportationDurationWithTips,
  applyItineraryGuards,
  dedupeNearIdenticalConsecutiveDays,
  dedupeSameDayMeals,
  isEnricherPlaceholderActivity,
  scrubUnsafeEarlyAirportTips,
  stripPhantomArrivals,
  stripPlaceholderActivities,
} from "@/lib/itineraryGuards";

function day(partial: Partial<DayPlan> & { day: number }): DayPlan {
  return {
    title: `Day ${partial.day}`,
    city: partial.city ?? "Panama City",
    lat: 8.98,
    lng: -79.52,
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

describe("isEnricherPlaceholderActivity", () => {
  it("flags generic morning enricher copy", () => {
    expect(
      isEnricherPlaceholderActivity({
        name: "Jutranji ogled / sprehod",
        description:
          "Glavni dopoldanski ogled — mesto ali znamenitost, ki jo je najbolje obiskati zjutraj.",
      }),
    ).toBe(true);
  });

  it("keeps real Casco Viejo sightseeing", () => {
    expect(
      isEnricherPlaceholderActivity({
        name: "Raziskovanje Casco Vieja",
        description: "Sprehod po starem mestnem jedru in Plaza de la Independencia.",
      }),
    ).toBe(false);
  });
});

describe("stripPlaceholderActivities", () => {
  it("removes enricher placeholder mornings", () => {
    const plan = {
      destinationName: "Panama",
      days: [
        day({
          day: 7,
          activities: {
            morning: [
              {
                name: "Jutranji ogled / sprehod",
                type: "ACTIVITY",
                description:
                  "Glavni dopoldanski ogled — mesto ali znamenitost, ki jo je najbolje obiskati zjutraj.",
              },
              {
                name: "San Blas day prep",
                type: "ACTIVITY",
                description: "Priprava na izlet naslednji dan.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;

    expect(stripPlaceholderActivities(plan)).toBe(1);
    expect(plan.days[0]!.activities!.morning).toHaveLength(1);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/San Blas/i);
  });
});

describe("dedupeSameDayMeals", () => {
  it("keeps one evening dinner and drops the generic second", () => {
    const plan = {
      destinationName: "Panama",
      days: [
        day({
          day: 7,
          activities: {
            morning: [],
            afternoon: [],
            evening: [
              {
                name: "Sproščena večerja po vrnitvi",
                type: "EAT",
                description: "Po Emberá izletu.",
              },
              {
                name: "Lokalna večerja",
                type: "EAT",
                description: "Večerja v restavraciji, kamor hodijo domačini.",
              },
            ],
          },
        }),
      ],
    } as AiTripPlan;

    expect(dedupeSameDayMeals(plan)).toBe(1);
    expect(plan.days[0]!.activities!.evening).toHaveLength(1);
    expect(plan.days[0]!.activities!.evening[0]!.name).toMatch(/Sproščena/i);
  });
});

describe("stripPhantomArrivals", () => {
  it("removes Tocumen re-arrival on day 2 when arrival was day 1", () => {
    const plan = {
      destinationName: "Panama",
      days: [
        day({
          day: 1,
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Prihod na mednarodno letališče Tocumen (PTY)",
                type: "TRANSPORT",
                description: "Pristanek in prevzem prtljage.",
              },
            ],
            evening: [],
          },
        }),
        day({
          day: 2,
          activities: {
            morning: [
              {
                name: "Casco Viejo",
                type: "SIGHT",
                description: "Staro mestno jedro.",
              },
            ],
            afternoon: [
              {
                name: "Prihod na mednarodno letališče Tocumen (PTY)",
                type: "TRANSPORT",
                description: "Ponovni prihod in transfer do centra.",
              },
            ],
            evening: [
              {
                name: "Prevoz do hotela (taxi)",
                type: "TRANSPORT",
                description: "Transfer z letališča do hotela v centru.",
              },
            ],
          },
        }),
      ],
    } as AiTripPlan;

    expect(stripPhantomArrivals(plan, 1)).toBe(2);
    expect(plan.days[0]!.activities!.afternoon).toHaveLength(1);
    expect(plan.days[1]!.activities!.afternoon).toHaveLength(0);
    expect(plan.days[1]!.activities!.evening).toHaveLength(0);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Casco/i);
  });
});

describe("dedupeNearIdenticalConsecutiveDays", () => {
  it("replaces a copy-pasted consecutive day", () => {
    const cloneActs = {
      morning: [
        {
          name: "Raziskovanje Casco Vieja (staro mestno jedro)",
          type: "SIGHT",
          description: "Sprehod po Casco Viejo.",
        },
      ],
      afternoon: [
        {
          name: "Obisk Panamskega prekopa – Miraflores Locks",
          type: "SIGHT",
          description: "Ogled zapornic.",
        },
      ],
      evening: [
        {
          name: "Večerja in nočno življenje v Casco Viejo",
          type: "EAT",
          description: "Večerja v Casco.",
        },
      ],
    };
    const plan = {
      destinationName: "Panama",
      contentLanguage: "sl",
      days: [
        day({ day: 3, city: "Panama City", activities: structuredClone(cloneActs) }),
        day({ day: 4, city: "Panama City", activities: structuredClone(cloneActs) }),
      ],
    } as AiTripPlan;

    expect(dedupeNearIdenticalConsecutiveDays(plan)).toBe(1);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Casco/i);
    expect(plan.days[1]!.title).toMatch(/prosti|lokalni/i);
    expect(plan.days[1]!.activities!.morning[0]!.name).not.toMatch(/Casco Vieja/i);
  });
});

describe("applyItineraryGuards", () => {
  it("applies all four Panama failure classes in one pass", () => {
    const cloneActs = {
      morning: [
        {
          name: "Raziskovanje Casco Vieja",
          type: "SIGHT",
          description: "Casco.",
        },
      ],
      afternoon: [
        {
          name: "Obisk Panamskega prekopa",
          type: "SIGHT",
          description: "Prekop.",
        },
      ],
      evening: [
        {
          name: "Večerja v Casco Viejo",
          type: "EAT",
          description: "Večerja.",
        },
      ],
    };
    const plan = {
      destinationName: "Panama",
      contentLanguage: "sl",
      days: [
        day({
          day: 1,
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Prihod na mednarodno letališče Tocumen (PTY)",
                type: "TRANSPORT",
                description: "Pristanek.",
              },
            ],
            evening: [],
          },
        }),
        day({
          day: 2,
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Prihod na mednarodno letališče Tocumen (PTY)",
                type: "TRANSPORT",
                description: "Ponovni prihod.",
              },
            ],
            evening: [],
          },
        }),
        day({ day: 3, activities: structuredClone(cloneActs) }),
        day({ day: 4, activities: structuredClone(cloneActs) }),
        day({
          day: 7,
          activities: {
            morning: [
              {
                name: "Jutranji ogled / sprehod",
                description:
                  "Glavni dopoldanski ogled — mesto ali znamenitost, ki jo je najbolje obiskati zjutraj.",
              },
            ],
            afternoon: [
              {
                name: "Celodnevni izlet v vas Emberá",
                type: "ACTIVITY",
                description: "Izlet.",
              },
            ],
            evening: [
              { name: "Sproščena večerja po vrnitvi", type: "EAT", description: "A" },
              { name: "Lokalna večerja", type: "EAT", description: "B" },
            ],
          },
        }),
      ],
    } as AiTripPlan;

    const stats = applyItineraryGuards(plan, { arrivalDay: 1, language: "sl" });
    expect(stats.placeholders).toBeGreaterThanOrEqual(1);
    expect(stats.meals).toBeGreaterThanOrEqual(1);
    expect(stats.arrivals).toBeGreaterThanOrEqual(1);
    expect(stats.clones).toBeGreaterThanOrEqual(1);
    expect(plan.days[1]!.activities!.afternoon).toHaveLength(0);
    expect(plan.days[4]!.activities!.evening).toHaveLength(1);
  });
});

describe("scrubUnsafeEarlyAirportTips", () => {
  it("removes first-RER advice for a 06:00 international departure", () => {
    const plan = {
      destinationName: "France",
      contentLanguage: "en",
      days: [
        day({
          day: 8,
          city: "Paris",
          transportationTips:
            "For an early morning flight from CDG, consider pre-booking a taxi or an Uber/Bolt the night before. Alternatively, if staying in central Paris, the RER B train starts running around 04:50 AM, but ensure it aligns with your check-in time.",
          activities: {
            morning: [
              {
                name: "International return flight",
                type: "TRANSPORT",
                description: "Depart 06:00.",
                arrivalTime: "06:00",
                departureTime: "07:25",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;

    expect(scrubUnsafeEarlyAirportTips(plan)).toBe(1);
    expect(plan.days[0]!.transportationTips).toMatch(/taxi|Uber/i);
    expect(plan.days[0]!.transportationTips).not.toMatch(/RER|04:50/i);
  });
});

describe("alignTransportationDurationWithTips", () => {
  it("lifts understated TGV banner duration to match tip hours", () => {
    const plan = {
      destinationName: "France",
      days: [
        day({
          day: 3,
          city: "Lyon",
          transportationTips:
            "The TGV train is the fastest way to travel from Paris to Lyon (approx. 2 hours).",
          transportation: [
            {
              type: "train",
              from: "Paris Gare de Lyon",
              to: "Lyon Part-Dieu",
              duration: "1h",
              estimatedPrice: 70,
            },
          ],
        }),
      ],
    } as AiTripPlan;

    expect(alignTransportationDurationWithTips(plan)).toBe(1);
    expect(plan.days[0]!.transportation![0]!.duration).toBe("2h");
  });
});
