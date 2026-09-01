import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  resolveReturnDepartClock,
  sanitizeDayCity,
  sanitizeItineraryPlan,
  stampLastDayReturnFlightClock,
} from "@/lib/itinerarySanitize";

function day(n: number, city: string, extra?: Partial<DayPlan>): DayPlan {
  return {
    day: n,
    date: `2026-10-${25 + n}`,
    title: city,
    city,
    focusName: city,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 50,
    lat: 0,
    lng: 0,
    category: "city",
    activities: extra?.activities ?? { morning: [], afternoon: [], evening: [] },
    ...extra,
  };
}

function planOf(days: DayPlan[], extra?: Partial<AiTripPlan>): AiTripPlan {
  return {
    destinationName: "Bali",
    summary: "test",
    contentLanguage: "sl",
    totalBudgetEur: 0,
    centerLat: -8.5,
    centerLng: 115.2,
    originIata: "MUC",
    destinationIata: "DPS",
    tripStyle: "explorer",
    days,
    ...extra,
  };
}

describe("sanitizeDayCity", () => {
  it("keeps a short island / city name", () => {
    expect(sanitizeDayCity("Nusa Penida")).toBe("Nusa Penida");
    expect(sanitizeDayCity("Ubud")).toBe("Ubud");
    expect(sanitizeDayCity("Rio de Janeiro")).toBe("Rio de Janeiro");
  });

  it("cuts after period, comma, dash, and newline", () => {
    expect(sanitizeDayCity("Nusa Penida. Po zajtrku čoln na Crystal Bay.")).toBe("Nusa Penida");
    expect(sanitizeDayCity("Nusa Penida, Bali")).toBe("Nusa Penida");
    expect(sanitizeDayCity("Ubud — temples at dawn")).toBe("Ubud");
    expect(sanitizeDayCity("Ubud - temples at dawn")).toBe("Ubud");
    expect(sanitizeDayCity("Seminyak\nPo zajtrku na plažo")).toBe("Seminyak");
  });

  it("caps glued itinerary prose at a real city (max 3 words)", () => {
    expect(sanitizeDayCity("Nusa Penida Po zajtrku odpeljemo se proti Crystal Bay")).toBe(
      "Nusa Penida",
    );
    expect(sanitizeDayCity("Ko Phi Phi After breakfast snorkeling")).toBe("Ko Phi Phi");
  });

  it("keeps hyphenated and particle place names", () => {
    expect(sanitizeDayCity("Saint-Tropez")).toBe("Saint-Tropez");
    expect(sanitizeDayCity("San Daniele del Friuli")).toBe("San Daniele del Friuli");
    expect(sanitizeDayCity("Frankfurt am Main")).toBe("Frankfurt am Main");
  });

  it("is a no-op on empty input", () => {
    expect(sanitizeDayCity("")).toBe("");
    expect(sanitizeDayCity("   ")).toBe("");
  });

  it("drops IATA + departure leftovers from a return-flight hop", () => {
    expect(sanitizeDayCity("MUC Odhod ob 14:30.")).toBe("");
  });
});

describe("stampLastDayReturnFlightClock", () => {
  it("overwrites the last-day return flight with flightContext.inboundDepart", () => {
    const plan = planOf(
      [
        day(1, "Ubud"),
        day(2, "Denpasar", {
          activities: {
            morning: [{ name: "Zadnji sprehod", arrivalTime: "09:00" }],
            afternoon: [
              {
                name: "Povratni let DPS → MUC",
                type: "flight",
                arrivalTime: "14:30",
                description: "Odhod ob 14:30 z mednarodnega letališča.",
              },
            ],
            evening: [],
          },
        }),
      ],
      { flightContext: { outboundDepart: "08:00", outboundArrive: "22:00", outboundArriveDayOffset: 0, inboundDepart: "09:25" } },
    );

    expect(stampLastDayReturnFlightClock(plan)).toBe(true);
    const flight = plan.days[1]!.activities?.afternoon?.[0];
    expect(flight?.arrivalTime).toBe("09:25");
    expect(flight?.description).toMatch(/09:25/);
    expect(flight?.description).not.toMatch(/14:30/);
  });

  it("reads flights.returnTime as an alias", () => {
    const plan = planOf([
      day(1, "Ubud"),
      day(2, "Denpasar", {
        activities: {
          morning: [],
          afternoon: [{ name: "Mednarodni let proti domu", arrivalTime: "16:00" }],
          evening: [],
        },
      }),
    ]);
    const withReturn = Object.assign(plan, { flights: { returnTime: "18:45" } });

    expect(resolveReturnDepartClock(withReturn)).toBe("18:45");
    stampLastDayReturnFlightClock(withReturn);
    expect(plan.days[1]!.activities?.afternoon?.[0]?.arrivalTime).toBe("18:45");
  });

  it("does not rewrite a domestic hop", () => {
    const plan = planOf(
      [
        day(1, "El Nido", {
          activities: {
            morning: [
              {
                name: "Notranji let MNL → El Nido",
                arrivalTime: "08:00",
                departureTime: "09:20",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
      { flightContext: { outboundDepart: "08:00", outboundArrive: "22:00", outboundArriveDayOffset: 0, inboundDepart: "09:25" } },
    );

    expect(stampLastDayReturnFlightClock(plan)).toBe(false);
    expect(plan.days[0]!.activities?.morning?.[0]?.arrivalTime).toBe("08:00");
    expect(plan.days[0]!.activities?.morning?.[0]?.departureTime).toBe("09:20");
  });
});

describe("sanitizeItineraryPlan", () => {
  it("cleans day.city and aligns the last-day flight clock in one pass", () => {
    const plan = planOf(
      [
        day(1, "Nusa Penida Po zajtrku gremo na točko"),
        day(2, "Denpasar, Bali", {
          focusName: "Denpasar, Bali",
          activities: {
            morning: [],
            afternoon: [{ name: "Povratni let ob 11:10", arrivalTime: "11:10" }],
            evening: [],
          },
        }),
      ],
      { returnFlightEu: { departureTime: "09:25", arrivalTimeEu: "18:00", fromAirport: "DPS", toAirport: "MUC", summary: "" } },
    );

    sanitizeItineraryPlan(plan);
    expect(plan.days[0]!.city).toBe("Nusa Penida");
    expect(plan.days[1]!.city).toBe("Denpasar");
    expect(plan.days[1]!.focusName).toBe("Denpasar");
    expect(plan.days[1]!.activities?.afternoon?.[0]?.arrivalTime).toBe("09:25");
    expect(plan.days[1]!.activities?.afternoon?.[0]?.name).toMatch(/09:25/);
  });
});
