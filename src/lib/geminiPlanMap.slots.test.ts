import { describe, expect, it } from "vitest";
import { tripPlanResponseToAiTripPlan } from "@/lib/geminiPlanMap";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";

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
});
