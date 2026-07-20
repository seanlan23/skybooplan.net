import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  buildDayMapView,
  cameraForDayView,
  collectDayPins,
  resolveDayCenter,
  MAX_DAY_PINS,
} from "@/lib/tripMapModel";

function day(partial: Partial<DayPlan> & { day: number }): DayPlan {
  return {
    title: partial.title ?? `Day ${partial.day}`,
    city: partial.city ?? "",
    focusName: partial.focusName,
    lat: partial.lat ?? 0,
    lng: partial.lng ?? 0,
    morning: partial.morning ?? "",
    afternoon: partial.afternoon ?? "",
    evening: partial.evening ?? "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 50,
    mapPins: partial.mapPins,
    activities: partial.activities,
    transportation: partial.transportation,
    inFlightDay: partial.inFlightDay,
    ...partial,
  } as DayPlan;
}

function plan(days: DayPlan[]): AiTripPlan {
  return {
    destinationName: "Phuket",
    destinationIata: "HKT",
    days,
  } as AiTripPlan;
}

describe("tripMapModel", () => {
  it("resolveDayCenter prefers city label over mismatched AI coords", () => {
    const d = day({
      day: 2,
      city: "Phuket",
      lat: 48.14, // Munich
      lng: 11.58,
    });
    const center = resolveDayCenter(d);
    expect(center).not.toBeNull();
    // Phuket is ~98E, not Munich ~11E
    expect(center![0]).toBeGreaterThan(90);
  });

  it("resolveDayCenter keeps Munich day in Europe (not Bangkok AI coords)", () => {
    const d = day({
      day: 1,
      city: "Munich",
      title: "Odhod iz MUC",
      lat: 13.75,
      lng: 100.5,
      inFlightDay: true,
    });
    const center = resolveDayCenter(d);
    expect(center).not.toBeNull();
    expect(center![0]).toBeLessThan(20); // Europe
    expect(center![1]).toBeGreaterThan(45);
  });

  it("resolveDayCenter prefers Bangkok city over nearby DMK hub", () => {
    const d = day({
      day: 3,
      city: "Bangkok",
      title: "Znamenitosti",
      lat: 13.9126, // DMK
      lng: 100.6068,
    });
    const center = resolveDayCenter(d);
    expect(center).not.toBeNull();
    // City center ~100.502, not DMK ~100.607
    expect(Math.abs(center![0] - 100.502)).toBeLessThan(0.05);
  });

  it("resolveDayCenter keeps Tokyo sightseeing off HND/NRT runways", () => {
    const d = day({
      day: 4,
      city: "Tokyo",
      title: "Shinjuku in parki",
      lat: 35.549, // HND
      lng: 139.779,
    });
    const center = resolveDayCenter(d);
    expect(center).not.toBeNull();
    // Tokyo city ~139.65, not HND ~139.78
    expect(Math.abs(center![0] - 139.65)).toBeLessThan(0.08);
    expect(center![1]).toBeGreaterThan(35.65);
  });

  it("collectDayPins drops airport logistics on sightseeing days", () => {
    const center: [number, number] = [139.65, 35.676];
    const d = day({
      day: 4,
      city: "Tokyo",
      title: "Tokyo sights",
      lat: 35.676,
      lng: 139.65,
      mapPins: [
        { name: "Prihod na letališče", lat: 35.549, lng: 139.779, category: "airport" },
        { name: "Shinjuku Gyoen", lat: 35.685, lng: 139.71, category: "nature" },
        { name: "Shinjuku Gyoen National Garden", lat: 35.6851, lng: 139.7102, category: "nature" },
        { name: "Senso-ji", lat: 35.7148, lng: 139.7967, category: "sightseeing" },
      ],
    });
    const pins = collectDayPins(d, center);
    expect(pins.every((p) => p.category !== "airport")).toBe(true);
    expect(pins.some((p) => /letališč|airport|haneda|narita/i.test(p.name))).toBe(false);
    // Duplicate Shinjuku names merge
    expect(pins.filter((p) => /shinjuku/i.test(p.name)).length).toBeLessThanOrEqual(1);
  });

  it("collectDayPins caps count and stays near center", () => {
    const center: [number, number] = [98.3, 7.9];
    const d = day({
      day: 3,
      city: "Phuket",
      lat: 7.9,
      lng: 98.3,
      mapPins: [
        { name: "Big Buddha", lat: 7.85, lng: 98.31, category: "sightseeing" },
        { name: "Patong", lat: 7.9, lng: 98.3, category: "beach" },
        { name: "Old Town", lat: 7.88, lng: 98.39, category: "sightseeing" },
        { name: "Kata", lat: 7.82, lng: 98.3, category: "beach" },
        { name: "Karon", lat: 7.84, lng: 98.29, category: "beach" },
        { name: "Extra", lat: 7.87, lng: 98.32, category: "food" },
        { name: "Munich Airport", lat: 48.35, lng: 11.78, category: "airport" },
      ],
    });
    const pins = collectDayPins(d, center);
    expect(pins.length).toBeLessThanOrEqual(MAX_DAY_PINS);
    expect(pins.every((p) => p.lng > 90)).toBe(true);
    expect(pins.some((p) => /munich/i.test(p.name))).toBe(false);
  });

  it("buildDayMapView camera ignores intercontinental inbound on sightseeing day", () => {
    const p = plan([
      day({
        day: 1,
        city: "Munich",
        lat: 48.14,
        lng: 11.58,
        inFlightDay: true,
        title: "Odhod",
      }),
      day({
        day: 2,
        city: "Phuket",
        lat: 7.88,
        lng: 98.3,
        title: "Prihod v Phuket",
        transportation: [
          {
            type: "flight",
            from: "MUC",
            to: "HKT",
            duration: "11h",
            estimatedPrice: 400,
          },
        ],
        mapPins: [{ name: "Hotel", lat: 7.89, lng: 98.29, category: "hotel" }],
      }),
      day({
        day: 7,
        city: "Ao Nang",
        lat: 8.03,
        lng: 98.83,
        title: "Plaže Ao Nang",
        mapPins: [{ name: "Railay", lat: 8.01, lng: 98.84, category: "beach" }],
      }),
    ]);

    const arrival = buildDayMapView(p, 2);
    expect(arrival?.center[0]).toBeGreaterThan(90);
    const cam = cameraForDayView(arrival!);
    expect(cam.center[0]).toBeGreaterThan(90);
    // Travel day may draw inbound arc, but camera stays on Phuket
    expect(cam.center[0]).toBeCloseTo(arrival!.center[0], 1);

    const beach = buildDayMapView(p, 7);
    expect(beach?.center[0]).toBeGreaterThan(90);
    expect(beach?.inboundRoute).toBeNull();
    expect(beach?.pins.some((x) => /railay/i.test(x.name))).toBe(true);
  });

  it("cameraForDayView stays on city center (ignores drone focus)", () => {
    const view = buildDayMapView(
      plan([
        day({
          day: 1,
          city: "Phuket",
          lat: 7.9,
          lng: 98.3,
          mapPins: [{ name: "Beach", lat: 7.9, lng: 98.3, category: "beach" }],
        }),
      ]),
      1,
    )!;
    const cam = cameraForDayView(view, { focus: { lat: 7.82, lng: 98.3 } });
    expect(cam.center).toEqual(view.center);
  });
});
