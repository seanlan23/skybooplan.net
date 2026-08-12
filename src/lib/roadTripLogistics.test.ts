import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  countHomeboundUnpaidNights,
  parseDriveHours,
  repairImplausibleDriveTimes,
  stripHomeboundPaidStays,
} from "@/lib/roadTripLogistics";

function day(partial: Partial<DayPlan> & { day: number; city: string }): DayPlan {
  return {
    title: `Day ${partial.day}`,
    lat: 0,
    lng: 0,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 120,
    ...partial,
  } as DayPlan;
}

describe("parseDriveHours", () => {
  it("reads Slovenian and compact labels", () => {
    expect(parseDriveHours("1 ura in 45 minut")).toBeCloseTo(1.75);
    expect(parseDriveHours("1h 45min")).toBeCloseTo(1.75);
    expect(parseDriveHours("3h")).toBe(3);
  });
});

describe("repairImplausibleDriveTimes", () => {
  it("rewrites Győr → Zagreb from 1h 45min to a 3–4h motorway stage", () => {
    const plan = {
      destinationName: "Prešov",
      originPlace: "Maribor, SI",
      groundTransportMode: "car",
      contentLanguage: "sl",
      days: [
        day({
          day: 16,
          city: "Zagreb",
          drivingDistanceKm: 80,
          drivingDurationHours: "1h 45min",
          transportation: [
            {
              type: "car",
              from: "Győr",
              to: "Zagreb",
              duration: "1 ura in 45 minut",
              estimatedPrice: 40,
            },
          ],
        }),
      ],
    } as AiTripPlan;

    expect(repairImplausibleDriveTimes(plan)).toBe(1);
    const hours = parseDriveHours(plan.days[0]!.drivingDurationHours)!;
    expect(hours).toBeGreaterThanOrEqual(3);
    expect(hours).toBeLessThanOrEqual(4.5);
    expect(plan.days[0]!.drivingDistanceKm).toBeGreaterThanOrEqual(280);
    expect(parseDriveHours(plan.days[0]!.transportation![0]!.duration)!).toBeGreaterThanOrEqual(3);
  });

  it("leaves a realistic 3h 30min stage alone", () => {
    const plan = {
      originPlace: "Maribor, SI",
      groundTransportMode: "car",
      days: [
        day({
          day: 16,
          city: "Zagreb",
          drivingDistanceKm: 320,
          drivingDurationHours: "3h 30min",
          transportation: [
            { type: "car", from: "Győr", to: "Zagreb", duration: "3h 30min", estimatedPrice: 40 },
          ],
        }),
      ],
    } as AiTripPlan;
    expect(repairImplausibleDriveTimes(plan)).toBe(0);
  });
});

describe("stripHomeboundPaidStays", () => {
  it("drops Ljubljana and Maribor hotels on the drive home", () => {
    const plan = {
      destinationName: "Prešov",
      originPlace: "Maribor, SI",
      groundTransportMode: "car",
      contentLanguage: "sl",
      days: [
        day({
          day: 15,
          city: "Győr",
          activities: {
            morning: [],
            afternoon: [],
            evening: [
              { name: "Hotel Győr", type: "hotel", estimatedCostEur: 90, priceLabel: "€90" },
            ],
          },
        }),
        day({
          day: 16,
          city: "Zagreb",
          activities: {
            morning: [],
            afternoon: [],
            evening: [
              { name: "Hotel Zagreb", type: "hotel", estimatedCostEur: 80, priceLabel: "€80" },
            ],
          },
        }),
        day({
          day: 17,
          city: "Ljubljana",
          dailyBudgetEur: 150,
          activities: {
            morning: [],
            afternoon: [],
            evening: [
              { name: "Nočitev v Ljubljani", type: "hotel", estimatedCostEur: 75, priceLabel: "€75" },
            ],
          },
        }),
        day({
          day: 18,
          city: "Maribor",
          dailyBudgetEur: 90,
          activities: {
            morning: [],
            afternoon: [],
            evening: [
              { name: "Nočitev v Mariboru", type: "hotel", estimatedCostEur: 60, priceLabel: "€60" },
            ],
          },
        }),
      ],
    } as AiTripPlan;

    expect(stripHomeboundPaidStays(plan)).toBe(2);
    expect(plan.days[0]!.activities!.evening[0]!.estimatedCostEur).toBe(90);
    expect(plan.days[1]!.activities!.evening[0]!.estimatedCostEur).toBe(80);
    expect(plan.days[2]!.activities!.evening[0]!.estimatedCostEur).toBe(0);
    expect(plan.days[2]!.activities!.evening[0]!.name).toMatch(/domov|Maribor/i);
    expect(plan.days[3]!.activities!.evening[0]!.estimatedCostEur).toBe(0);
    expect(plan.days[3]!.activities!.evening[0]!.name).toMatch(/doma/i);
    expect(countHomeboundUnpaidNights(plan)).toBe(2);
  });
});
