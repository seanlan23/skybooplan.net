import { describe, expect, it } from "vitest";
import {
  dedupePlanDaysByNumber,
  parseRouteFromTitle,
  planCalendarDayCount,
  tripPlanResponseToAiTripPlan,
} from "@/lib/geminiPlanMap";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import type { DayPlan } from "@/lib/aiPlan.functions";

function minimalPlan(
  activities: TripPlanResponse["itinerar"][number]["days"][number]["activities"],
): TripPlanResponse {
  return {
    trip_metadata: {
      destination: "Thailand",
      season_warning: "Test season warning long enough.",
      currency: "EUR",
      visa_required: false,
    },
    itinerar: [
      {
        phase: "Odhod",
        city: "Munich",
        unsplashQuery: "Munich",
        lat: 48.3538,
        lng: 11.7861,
        pois: [
          {
            name: "Munich Airport",
            description: "Departure hub",
            lat: 48.3538,
            lng: 11.7861,
            unsplashQuery: "Munich Airport",
            tripAdvisorStyleDetails: {
              highlights: ["Terminals", "Shops"],
              proTip: "Arrive early for long-haul check-in queues.",
              bestTimeOfDay: "evening",
              rating: 4.2,
              reviewSummary: "Busy but efficient long-haul departure airport.",
            },
          },
        ],
        days: [
          {
            day_number: 1,
            date: "2026-10-01",
            day_name: "Četrtek",
            title: "Odhod iz MUC",
            dailyBudget: 70,
            drivingDistanceKm: 0,
            drivingDurationHours: "0h",
            transportation: [
              {
                type: "flight",
                from: "MUC",
                to: "BKK",
                duration: "11h",
                estimatedPrice: 500,
              },
            ],
            activities,
          },
        ],
      },
    ],
    logistics_and_tips: {
      transport: {
        flights: "Long-haul overnight.",
        ferries: "n/a",
        city_transport: "n/a",
      },
      finance: "EUR cards widely accepted.",
      internet: "eSIM works well.",
    },
    hotels: [],
  };
}

describe("tripPlanResponseToAiTripPlan slotting", () => {
  it("puts late-evening departure in evening even if Gemini says dopoldan", () => {
    const plan = tripPlanResponseToAiTripPlan(
      minimalPlan([
        {
          time: "22:30",
          title: "Mednarodni let MUC → BKK",
          description: "Overnight long-haul.",
          category: "airport",
          timeSlot: "dopoldan",
          arrivalTime: "22:30",
          departureTime: "18:10",
          transport_type: "flight",
          duration: "11h",
          estimatedCostEur: 500,
        },
      ]),
    );

    const day = plan.days[0]!;
    expect(day.activities.evening.some((a) => /Mednarodni let/i.test(a.name))).toBe(true);
    expect(day.activities.morning.some((a) => /Mednarodni let/i.test(a.name))).toBe(false);
  });

  it("dedupes duplicate day_number across itinerar phases", () => {
    const base = minimalPlan([
      {
        time: "22:05",
        title: "Odhod",
        description: "Let",
        category: "airport",
        timeSlot: "vecer",
        transport_type: "flight",
        duration: "11h",
        estimatedCostEur: 400,
      },
    ]);
    base.itinerar.push({
      phase: "Krabi A",
      city: "Krabi",
      unsplashQuery: "Krabi",
      lat: 8.0863,
      lng: 98.9063,
      pois: [],
      days: [
        {
          day_number: 5,
          date: "2026-11-06",
          day_name: "Petek",
          title: "Islands",
          dailyBudget: 80,
          drivingDistanceKm: 0,
          drivingDurationHours: "0h",
          transportation: [],
          activities: [
            {
              time: "09:00",
              title: "4 islands",
              description: "Boat",
              category: "beach",
              timeSlot: "dopoldan",
              transport_type: "ferry",
              duration: "6h",
              estimatedCostEur: 40,
            },
          ],
        },
      ],
    });
    base.itinerar.push({
      phase: "Krabi B duplicate",
      city: "Krabi",
      unsplashQuery: "Krabi Thailand",
      lat: 8.0863,
      lng: 98.9063,
      pois: [],
      days: [
        {
          day_number: 5,
          date: "2026-11-06",
          day_name: "Petek",
          title: "Islands again",
          dailyBudget: 80,
          drivingDistanceKm: 0,
          drivingDurationHours: "0h",
          transportation: [],
          activities: [
            {
              time: "09:00",
              title: "4 islands",
              description: "Boat",
              category: "beach",
              timeSlot: "dopoldan",
              transport_type: "ferry",
              duration: "6h",
              estimatedCostEur: 40,
            },
          ],
        },
      ],
    });

    const plan = tripPlanResponseToAiTripPlan(base);
    expect(plan.days.filter((d) => d.day === 5)).toHaveLength(1);
    expect(planCalendarDayCount(plan.days)).toBe(5);
  });
});

describe("dedupePlanDaysByNumber", () => {
  it("keeps the richer duplicate day", () => {
    const thin: DayPlan = {
      day: 5,
      date: "2026-11-06",
      title: "Thin",
      city: "Krabi",
      lat: 8,
      lng: 98,
      activities: { morning: [], afternoon: [], evening: [] },
    };
    const rich: DayPlan = {
      day: 5,
      date: "2026-11-06",
      title: "Rich",
      city: "Krabi",
      lat: 8,
      lng: 98,
      activities: {
        morning: [{ name: "Boat", type: "SIGHT", description: "x" }],
        afternoon: [{ name: "Beach", type: "SIGHT", description: "y" }],
        evening: [],
      },
    };
    const out = dedupePlanDaysByNumber([thin, rich]);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe("Rich");
  });
});

describe("parseRouteFromTitle", () => {
  it("does not split High-Speed compounds on hyphen", () => {
    expect(parseRouteFromTitle("High-Speed Train to Lyon")).toEqual({});
  });

  it("still parses spaced hyphen and arrow routes", () => {
    expect(parseRouteFromTitle("Paris - Lyon")).toEqual({ from: "Paris", to: "Lyon" });
    expect(parseRouteFromTitle("Paris → Lyon")).toEqual({ from: "Paris", to: "Lyon" });
  });
});

describe("car road trip inFlightDay", () => {
  it("does not treat Odhod z Dunaja as an airport day", () => {
    const data: TripPlanResponse = {
      trip_metadata: {
        destination: "Albania",
        season_warning: "Late summer Balkans driving.",
        currency: "EUR",
        visa_required: false,
      },
      itinerar: [
        {
          phase: "Zagreb",
          city: "Zagreb",
          unsplashQuery: "Zagreb",
          lat: 45.815,
          lng: 15.982,
          pois: [],
          days: [
            {
              day_number: 1,
              date: "2026-08-24",
              day_name: "Ponedeljek",
              title: "Odhod z Dunaja",
              dailyBudget: 80,
              drivingDistanceKm: 380,
              drivingDurationHours: "4h",
              transportation: [{ type: "car", from: "Vienna", to: "Zagreb", duration: "4h" }],
              activities: [
                {
                  title: "Vožnja Dunaj → Zagreb",
                  description: "Avtocesta.",
                  category: "transport",
                  timeSlot: "dopoldan",
                },
              ],
            },
            {
              day_number: 2,
              date: "2026-08-25",
              day_name: "Torek",
              title: "Zagreb",
              dailyBudget: 80,
              drivingDistanceKm: 0,
              drivingDurationHours: "0h",
              activities: [
                {
                  title: "Gornji grad",
                  description: "Sprehod.",
                  category: "culture",
                  timeSlot: "dopoldan",
                },
              ],
            },
          ],
        },
      ],
      logistics_and_tips: {
        transport: { flights: "n/a", ferries: "n/a", city_transport: "n/a" },
        finance: "EUR",
        internet: "eSIM",
      },
      hotels: [],
    };

    const plan = tripPlanResponseToAiTripPlan(data, {
      groundTransportMode: "car",
      originPlace: "Vienna",
      destinationPlace: "Albania",
    });
    expect(plan.days[0]?.inFlightDay).toBeFalsy();
    expect(plan.accommodationMode).toBe("hotel");
  });
});
