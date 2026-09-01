import { describe, expect, it } from "vitest";
import { tripPlanResponseToAiTripPlan } from "@/lib/geminiPlanMap";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import {
  sanitizeReturnFromAirport,
  sanitizeReturnFlightEu,
} from "@/lib/returnFlightAirports";

describe("sanitizeReturnFromAirport", () => {
  it("replaces a foreign hub like BUD with the destination IATA", () => {
    expect(
      sanitizeReturnFromAirport("BUD", {
        destinationIata: "DPS",
        originIata: "MUC",
      }),
    ).toBe("DPS");
    expect(
      sanitizeReturnFromAirport("Ubud", {
        destinationIata: "DPS",
        originIata: "MUC",
      }),
    ).toBe("DPS");
  });

  it("keeps an open-jaw return hub", () => {
    expect(
      sanitizeReturnFromAirport("BKK", {
        destinationIata: "SGN",
        originIata: "MUC",
        returnFromIata: "BKK",
      }),
    ).toBe("BKK");
  });
});

describe("sanitizeReturnFlightEu", () => {
  it("rewrites Gemini BUD origin on a Bali return to DPS", () => {
    const rf = sanitizeReturnFlightEu(
      {
        departureTime: "21:10",
        arrivalTimeEu: "06:00",
        fromAirport: "BUD",
        toAirport: "MUC",
        summary: "Direct flight BUD → MUC.",
      },
      { destinationIata: "DPS", originIata: "MUC", language: "sl" },
    );
    expect(rf?.fromAirport).toBe("DPS");
    expect(rf?.toAirport).toBe("MUC");
    expect(rf?.summary).toMatch(/DPS/);
    expect(rf?.summary).not.toMatch(/\bBUD\b/);
  });
});

describe("tripPlanResponseToAiTripPlan return IATA", () => {
  it("does not keep BUD as the Bali inbound origin", () => {
    const data = {
      trip_metadata: {
        destination: "Bali",
        season_warning: "Sušna sezona, vročina popoldan.",
        currency: "IDR",
        visa_required: false,
        return_flight_eu: {
          departure_time: "21:10",
          arrival_time_eu: "06:00",
          from_airport: "BUD",
          to_airport: "MUC",
          summary: "Povratni let BUD → MUC.",
        },
      },
      itinerar: [
        {
          phase: "Bali",
          city: "Ubud",
          unsplashQuery: "Ubud",
          lat: -8.506,
          lng: 115.263,
          pois: [],
          days: [
            {
              day_number: 1,
              date: "2026-10-26",
              day_name: "Ponedeljek",
              title: "Ubud",
              dailyBudget: 80,
              drivingDistanceKm: 0,
              drivingDurationHours: "0h",
              activities: [
                {
                  title: "Sacred Monkey Forest",
                  description: "Sprehod med opicami v Ubudu.",
                  category: "culture",
                  timeSlot: "dopoldan",
                },
              ],
            },
          ],
        },
      ],
      logistics_and_tips: {
        transport: { flights: "DPS.", ferries: "n/a", city_transport: "n/a" },
        finance: "IDR.",
        internet: "eSIM.",
      },
      hotels: [],
    } as TripPlanResponse;

    const plan = tripPlanResponseToAiTripPlan(data, {
      originIata: "MUC",
      destinationIata: "DPS",
      language: "sl",
    });
    expect(plan.returnFlightEu?.fromAirport).toBe("DPS");
    expect(plan.returnFlightEu?.toAirport).toBe("MUC");
  });
});
