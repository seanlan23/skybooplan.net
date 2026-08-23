import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { applyItineraryGuards } from "@/lib/itineraryGuards";
import {
  applyIslandHopLogistics,
  dropDuplicateIslandArrivals,
  ensureGroundToAirportWindow,
  inferStayCity,
  repairStayCitiesFromContent,
  rewriteImpossiblePhConnections,
} from "@/lib/islandHopLogistics";
import { parseDriveHours, repairImplausibleDriveTimes, stripDriveStatsOnAirDays } from "@/lib/roadTripLogistics";

function day(partial: Partial<DayPlan> & { day: number; city: string }): DayPlan {
  return {
    title: `Day ${partial.day}`,
    lat: 14.599,
    lng: 120.984,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 90,
    ...partial,
  } as DayPlan;
}

function phPlan(days: DayPlan[]): AiTripPlan {
  return {
    destinationName: "Philippines",
    destinationIata: "MNL",
    originIata: "MUC",
    contentLanguage: "sl",
    days,
  } as AiTripPlan;
}

describe("inferStayCity / repairStayCitiesFromContent", () => {
  it("sets El Nido when activities are Nacpan / Tour A even if city is Manila", () => {
    const d = day({
      day: 5,
      city: "Manila",
      title: "Tour A in Nacpan",
      activities: {
        morning: [{ name: "El Nido Tour A", type: "SIGHT", description: "Big Lagoon." }],
        afternoon: [{ name: "Nacpan Beach", type: "BEACH", description: "Popoldne na plaži." }],
        evening: [{ name: "Las Cabanas", type: "BEACH", description: "Sonnenuntergang." }],
      },
    });
    expect(inferStayCity(d)).toBe("El Nido");
    const plan = phPlan([day({ day: 1, city: "München", inFlightDay: true }), d]);
    expect(repairStayCitiesFromContent(plan)).toBe(1);
    expect(plan.days[1]!.city).toBe("El Nido");
    expect(plan.days[1]!.lat).toBeCloseTo(11.194, 2);
    expect(plan.days[1]!.lng).toBeCloseTo(119.411, 2);
  });
});

describe("stripDriveStatsOnAirDays / repairImplausibleDriveTimes", () => {
  it("does not count Manila → El Nido as a 6h / 498 km road drive", () => {
    const plan = phPlan([
      day({
        day: 4,
        city: "El Nido",
        inFlightDay: true,
        drivingDistanceKm: 80,
        drivingDurationHours: "1h 20min",
        transportation: [
          {
            type: "flight",
            from: "Manila (MNL)",
            to: "El Nido (ENI)",
            duration: "1h 20min",
            estimatedPrice: 90,
          },
        ],
      }),
    ]);
    expect(repairImplausibleDriveTimes(plan)).toBe(0);
    expect(stripDriveStatsOnAirDays(plan)).toBe(1);
    expect(plan.days[0]!.drivingDistanceKm).toBe(0);
    expect(plan.days[0]!.drivingDurationHours).toBe("0h");
    expect(parseDriveHours(plan.days[0]!.transportation![0]!.duration)).toBeCloseTo(1.33, 1);
  });
});

describe("dropDuplicateIslandArrivals", () => {
  it("drops a second MNL→ENI after already staying in El Nido, without emptying the day", () => {
    const plan = phPlan([
      day({
        day: 4,
        city: "El Nido",
        transportation: [
          {
            type: "flight",
            from: "Manila (MNL)",
            to: "El Nido (ENI)",
            duration: "1h 20min",
            estimatedPrice: 90,
          },
        ],
      }),
      day({
        day: 5,
        city: "El Nido",
        activities: {
          morning: [{ name: "Tour A", type: "SIGHT", description: "Big Lagoon." }],
          afternoon: [],
          evening: [],
        },
      }),
      day({
        day: 7,
        city: "El Nido",
        title: "Ponovni let v El Nido",
        transportation: [
          {
            type: "flight",
            from: "Manila (MNL)",
            to: "El Nido (ENI)",
            duration: "1h 20min",
            estimatedPrice: 90,
          },
        ],
        activities: {
          morning: [
            {
              name: "Notranji let Manila → El Nido",
              type: "TRANSPORT",
              description: "MNL–ENI.",
            },
          ],
          afternoon: [{ name: "Tour A", type: "SIGHT", description: "Še en Big Lagoon." }],
          evening: [],
        },
      }),
    ]);
    expect(dropDuplicateIslandArrivals(plan)).toBeGreaterThan(0);
    expect(plan.days[2]!.transportation?.some((l) => l.type === "flight")).toBeFalsy();
    expect(plan.days[2]!.activities!.afternoon[0]!.name).toMatch(/Tour A/i);
    expect(plan.days[2]!.activities!.morning.some((a) => /let Manila/i.test(a.name))).toBe(false);
  });
});

describe("rewriteImpossiblePhConnections", () => {
  it("rewrites ENI→TAG as a hub connection of at least 4h", () => {
    const plan = phPlan([
      day({
        day: 11,
        city: "Bohol",
        transportation: [
          {
            type: "flight",
            from: "El Nido (ENI)",
            to: "Tagbilaran (TAG)",
            duration: "1h 30min",
            estimatedPrice: 80,
          },
        ],
        activities: {
          morning: [
            {
              name: "Notranji let El Nido → Tagbilaran (1h 30min)",
              type: "TRANSPORT",
              description: "Direktni let.",
            },
          ],
          afternoon: [],
          evening: [],
        },
      }),
    ]);
    expect(rewriteImpossiblePhConnections(plan, "sl")).toBe(1);
    const flights = (plan.days[0]!.transportation ?? []).filter((l) => l.type === "flight");
    expect(flights.length).toBeGreaterThanOrEqual(2);
    expect(flights.some((l) => /MNL/i.test(`${l.from} ${l.to}`))).toBe(true);
    expect(plan.days[0]!.transportationTips).toMatch(/MNL/i);
    expect(plan.days[0]!.activities!.morning[0]!.transportDuration).toMatch(/5–6h|4–6h/);
  });
});

describe("ensureGroundToAirportWindow", () => {
  it("pulls a 6h El Nido→PPS van to ≤06:00 when the domestic flight is 14:00", () => {
    const plan = phPlan([
      day({ day: 1, city: "München", inFlightDay: true }),
      day({
        day: 8,
        city: "El Nido",
        transportation: [
          {
            type: "van",
            from: "El Nido",
            to: "Puerto Princesa (PPS)",
            duration: "5–6h",
            estimatedPrice: 20,
          },
          {
            type: "flight",
            from: "Puerto Princesa (PPS)",
            to: "Manila (MNL)",
            duration: "1h 20min",
            estimatedPrice: 70,
          },
        ],
        activities: {
          morning: [
            {
              name: "Van El Nido → Puerto Princesa ob 08:00",
              type: "TRANSPORT",
              transportType: "van",
              departureTime: "08:00",
              description: "Odhod 08:00.",
            },
          ],
          afternoon: [
            {
              name: "Notranji let PPS → MNL ob 14:00",
              type: "TRANSPORT",
              transportType: "flight",
              departureTime: "14:00",
              description: "Odlet 14:00.",
            },
          ],
          evening: [],
        },
      }),
      day({ day: 16, city: "Manila", inFlightDay: true }),
    ]);
    expect(ensureGroundToAirportWindow(plan, "sl")).toBeGreaterThan(0);
    const vanAct = plan.days[1]!.activities!.morning.find((a) => /van/i.test(a.name))!;
    const leave = Number(vanAct.departureTime!.slice(0, 2)) * 60 + Number(vanAct.departureTime!.slice(3));
    expect(leave).toBeLessThanOrEqual(6 * 60);
    const blob = JSON.stringify(plan.days[1]!.activities);
    expect(blob).toMatch(/1 uro pred odletom/i);
  });
});

describe("applyItineraryGuards Philippines hop", () => {
  it("fixes city, drive stats, duplicate arrival, and ENI→TAG in one pass", () => {
    const plan = phPlan([
      day({ day: 1, city: "München", inFlightDay: true }),
      day({
        day: 4,
        city: "Manila",
        inFlightDay: true,
        drivingDistanceKm: 498,
        drivingDurationHours: "6h 15min",
        transportation: [
          {
            type: "flight",
            from: "Manila (MNL)",
            to: "El Nido (ENI)",
            duration: "1h 20min",
            estimatedPrice: 90,
          },
        ],
        activities: {
          morning: [
            { name: "Notranji let Manila → El Nido", type: "TRANSPORT", description: "MNL–ENI." },
          ],
          afternoon: [{ name: "Nacpan Beach", type: "BEACH", description: "Prvi popoldne." }],
          evening: [],
        },
      }),
      day({
        day: 5,
        city: "Manila",
        activities: {
          morning: [{ name: "El Nido Tour A", type: "SIGHT", description: "Big Lagoon." }],
          afternoon: [{ name: "Nacpan Beach", type: "BEACH", description: "Plaža." }],
          evening: [],
        },
      }),
      day({
        day: 7,
        city: "El Nido",
        transportation: [
          {
            type: "flight",
            from: "Manila (MNL)",
            to: "El Nido (ENI)",
            duration: "1h 20min",
            estimatedPrice: 90,
          },
        ],
        activities: {
          morning: [
            { name: "Notranji let Manila → El Nido", type: "TRANSPORT", description: "Drugič." },
          ],
          afternoon: [{ name: "El Nido Tour A", type: "SIGHT", description: "Big Lagoon in Small Lagoon." }],
          evening: [],
        },
      }),
      day({
        day: 11,
        city: "Bohol",
        transportation: [
          {
            type: "flight",
            from: "El Nido (ENI)",
            to: "Tagbilaran (TAG)",
            duration: "1h 30min",
            estimatedPrice: 80,
          },
        ],
      }),
      day({ day: 16, city: "Manila", inFlightDay: true }),
    ]);
    applyItineraryGuards(plan, { language: "sl" });
    expect(plan.days[1]!.city).toBe("El Nido");
    expect(plan.days[2]!.city).toBe("El Nido");
    expect(plan.days[1]!.drivingDistanceKm ?? 0).toBe(0);
    expect(plan.days[1]!.drivingDurationHours === "0h" || !plan.days[1]!.drivingDurationHours).toBe(
      true,
    );
    expect(plan.days[3]!.transportation?.some((l) => l.type === "flight")).toBeFalsy();
    expect(plan.days[3]!.activities!.afternoon[0]!.name).toMatch(/Tour A/i);
    const hopFlights = (plan.days[4]!.transportation ?? []).filter((l) => l.type === "flight");
    expect(hopFlights.length).toBeGreaterThanOrEqual(2);
  });
});

describe("applyIslandHopLogistics", () => {
  it("returns counts without emptying sightseeing days", () => {
    const plan = phPlan([
      day({ day: 1, city: "München" }),
      day({
        day: 5,
        city: "Manila",
        activities: {
          morning: [{ name: "Nacpan Beach", type: "BEACH", description: "Plaža." }],
          afternoon: [],
          evening: [],
        },
      }),
    ]);
    const stats = applyIslandHopLogistics(plan, "sl");
    expect(stats.cities).toBe(1);
    expect(plan.days[1]!.activities!.morning).toHaveLength(1);
  });
});
