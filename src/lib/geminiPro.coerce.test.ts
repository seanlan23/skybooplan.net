import { describe, expect, it } from "vitest";
import { coerceTripPlanPayload, parseCoercedTripPlan } from "@/lib/geminiPro.shared";

describe("coerceTripPlanPayload", () => {
  it("fills transport_type, duration, transportation, and empty pois", () => {
    const raw = {
      trip_metadata: {
        destination: "Thailand",
        season_warning: "October is transitional season with occasional showers.",
        currency: "EUR",
        visa_required: false,
      },
      itinerar: [
        {
          phase: "Bangkok",
          city: "Bangkok",
          unsplashQuery: "Bangkok",
          lat: 13.75,
          lng: 100.5,
          pois: [],
          days: [
            {
              day_number: 1,
              date: "2026-10-26",
              day_name: "Monday",
              title: "Arrival",
              dailyBudget: 80,
              drivingDistanceKm: 0,
              drivingDurationHours: "0h",
              activities: [
                {
                  time: "18:00",
                  title: "Prihod na letališče BKK",
                  description: "Landing and transfer.",
                  category: "airport",
                  timeSlot: "vecer",
                  arrivalTime: "17:55",
                  departureTime: "19:30",
                },
                {
                  time: "20:00",
                  title: "Grand Palace area stroll",
                  description: "Light evening walk after check-in.",
                  category: "sightseeing",
                  timeSlot: "vecer",
                  arrivalTime: "20:00",
                  departureTime: "21:30",
                  coordinates: { lat: 13.75, lng: 100.49 },
                },
              ],
            },
          ],
        },
      ],
      logistics_and_tips: {
        transport: { flights: "BKK", ferries: "n/a", city_transport: "Grab" },
        finance: "EUR/THB",
        internet: "eSIM",
      },
      hotels: [],
    };

    const parsed = parseCoercedTripPlan(coerceTripPlanPayload(raw));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const phase = parsed.data.itinerar[0]!;
    expect(phase.pois.length).toBeGreaterThan(0);
    const airport = phase.days[0]!.activities[0]!;
    expect(airport.transport_type).toBe("flight");
    expect(airport.duration).toBeTruthy();
    expect(phase.days[0]!.transportation?.length).toBeGreaterThan(0);
  });
});
