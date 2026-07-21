/**
 * Smoke checklist from map-truth-freeze — automated pass/fail on the MapDay model.
 * Live UI bits (hover, Unsplash timing, play) still need a hard-refresh + new plan on production.
 */
import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  buildMapDay,
  cameraForMapDay,
  cameraMoveDurationMs,
  finalizeItineraryMapCoords,
  isLongHaulCameraMove,
  resolveCityCenter,
} from "@/lib/itineraryMapModel";

function day(partial: Partial<DayPlan> & { day: number }): DayPlan {
  return {
    title: partial.title ?? `Day ${partial.day}`,
    city: partial.city ?? "",
    lat: partial.lat ?? 0,
    lng: partial.lng ?? 0,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 50,
    ...partial,
  } as DayPlan;
}

function plan(days: DayPlan[]): AiTripPlan {
  return { destinationName: "Smoke", days } as AiTripPlan;
}

describe("map smoke checklist", () => {
  it("1+2: sightseeing city center, not runway (Tokyo / Ubud)", () => {
    const tokyo = resolveCityCenter(
      day({ day: 4, city: "Tokyo", title: "Parks", lat: 35.549, lng: 139.779 }),
    );
    expect(tokyo!.lat).toBeGreaterThan(35.65);
    expect(Math.abs(tokyo!.lng - 139.65)).toBeLessThan(0.08);

    const ubud = resolveCityCenter(
      day({ day: 3, city: "Ubud", title: "Temples", lat: -8.748, lng: 115.167 }), // DPS-ish
    );
    expect(ubud!.lat).toBeCloseTo(-8.506, 1);
  });

  it("3: max ~4 pins, no airport logistics on sightseeing day", () => {
    const view = buildMapDay(
      plan([
        day({
          day: 2,
          city: "Ubud",
          lat: -8.506,
          lng: 115.263,
          mapPins: [
            { name: "Airport", lat: -8.748, lng: 115.167, category: "airport" },
            { name: "Tegallalang", lat: -8.43, lng: 115.28, category: "nature" },
            { name: "Goa Gajah", lat: -8.523, lng: 115.287, category: "sightseeing" },
            { name: "Monkey Forest", lat: -8.519, lng: 115.259, category: "nature" },
            { name: "Tirta Empul", lat: -8.415, lng: 115.315, category: "sightseeing" },
            { name: "Art Market", lat: -8.507, lng: 115.262, category: "sightseeing" },
          ],
        }),
      ]),
      2,
    );
    expect(view!.pins.length).toBeLessThanOrEqual(4);
    expect(view!.pins.every((p) => p.category !== "airport")).toBe(true);
  });

  it("4: pin can carry photo URL (hover/enlarge needs browser)", () => {
    const view = buildMapDay(
      plan([
        day({
          day: 2,
          city: "Ubud",
          lat: -8.506,
          lng: 115.263,
          mapPins: [
            {
              name: "Tegallalang",
              lat: -8.43,
              lng: 115.28,
              category: "nature",
              imageUrl: "https://images.example/rice.jpg",
            },
          ],
        }),
      ]),
      2,
    );
    expect(view!.pins[0]?.imageUrl).toContain("rice.jpg");
  });

  it("5: pin keeps description for click modal", () => {
    const view = buildMapDay(
      plan([
        day({
          day: 2,
          city: "Ubud",
          lat: -8.506,
          lng: 115.263,
          mapPins: [
            {
              name: "Goa Gajah",
              lat: -8.523,
              lng: 115.287,
              category: "sightseeing",
              description: "Elephant Cave temple",
            },
          ],
        }),
      ]),
      2,
    );
    expect(view!.pins[0]?.description).toMatch(/Elephant/i);
  });

  it("6: camera stays on day center; travel day has leg, sightseeing does not", () => {
    const p = plan([
      day({
        day: 1,
        city: "Munich",
        lat: 48.137,
        lng: 11.575,
        inFlightDay: true,
        transportation: [
          { type: "flight", from: "MUC", to: "DPS", duration: "14h", estimatedPrice: 500 },
        ],
      }),
      day({
        day: 2,
        city: "Ubud",
        title: "Prihod",
        lat: -8.506,
        lng: 115.263,
        inFlightDay: true,
        transportation: [
          { type: "flight", from: "MUC", to: "DPS", duration: "14h", estimatedPrice: 500 },
        ],
      }),
      day({
        day: 3,
        city: "Ubud",
        title: "Temples",
        lat: -8.506,
        lng: 115.263,
      }),
    ]);
    const arrival = buildMapDay(p, 2)!;
    expect(arrival.legIn?.mode).toBe("flight");
    const sights = buildMapDay(p, 3)!;
    expect(sights.legIn).toBeUndefined();
    const cam = cameraForMapDay(sights);
    expect(cam.center).toEqual([sights.center.lng, sights.center.lat]);
  });

  it("long-haul camera (MUC→BKK) is slow flyTo, not instant easeTo", () => {
    // ~8800 km Munich–Bangkok
    expect(isLongHaulCameraMove(8800)).toBe(true);
    expect(cameraMoveDurationMs(8800)).toBeGreaterThanOrEqual(5000);
    expect(cameraMoveDurationMs(50)).toBeLessThan(4000);
  });

  it("finalize strips runway dumps before map sees them", () => {
    const p = plan([
      day({
        day: 4,
        city: "Tokyo",
        lat: 35.549,
        lng: 139.779,
        mapPins: [{ name: "HND", lat: 35.549, lng: 139.779, category: "airport" }],
      }),
    ]);
    finalizeItineraryMapCoords(p);
    expect(p.days[0]!.lat).toBeGreaterThan(35.65);
    expect(p.days[0]!.mapPins?.some((x) => x.category === "airport")).toBeFalsy();
  });
});
