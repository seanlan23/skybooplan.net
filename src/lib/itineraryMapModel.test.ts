import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  buildMapDay,
  cameraForMapDay,
  finalizeItineraryMapCoords,
  resolveCityCenter,
  MAX_DAY_PINS,
} from "@/lib/itineraryMapModel";

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
    destinationName: "Test",
    destinationIata: "HKT",
    days,
  } as AiTripPlan;
}

describe("itineraryMapModel", () => {
  it("resolveCityCenter knows Santorini / Hong Kong hubs", () => {
    expect(resolveCityCenter(day({ day: 5, city: "Santorini" }))).toMatchObject({
      lat: expect.any(Number),
      lng: expect.any(Number),
    });
    expect(resolveCityCenter(day({ day: 3, city: "Hong Kong" }))!.lat).toBeCloseTo(22.32, 1);
  });

  it("collects activity coords when mapPins are empty", () => {
    const md = buildMapDay(
      plan([
        day({
          day: 5,
          city: "Santorini",
          mapPins: [],
          activities: {
            morning: [
              {
                name: "Oia sunset walk",
                type: "SIGHT",
                description: "Caldera views",
                lat: 36.461,
                lng: 25.375,
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ]),
      5,
    );
    expect(md).not.toBeNull();
    expect(md!.pins.length).toBeGreaterThan(0);
    expect(md!.pins[0]!.name).toMatch(/oia/i);
  });

  it("resolveCityCenter prefers city label over mismatched AI coords", () => {
    const d = day({
      day: 2,
      city: "Phuket",
      lat: 48.14, // Munich
      lng: 11.58,
    });
    const center = resolveCityCenter(d);
    expect(center).not.toBeNull();
    expect(center!.lat).toBeCloseTo(7.88, 1);
    expect(center!.lng).toBeCloseTo(98.39, 1);
  });

  it("resolveCityCenter keeps Tokyo sightseeing off HND/NRT runways", () => {
    const d = day({
      day: 4,
      city: "Tokyo",
      title: "Shinjuku in parki",
      lat: 35.549, // HND
      lng: 139.779,
    });
    const center = resolveCityCenter(d);
    expect(center).not.toBeNull();
    expect(Math.abs(center!.lng - 139.65)).toBeLessThan(0.08);
    expect(center!.lat).toBeGreaterThan(35.65);
  });

  it("resolveCityCenter prefers Bangkok city over DMK runway AI", () => {
    const d = day({
      day: 3,
      city: "Bangkok",
      title: "Znamenitosti",
      lat: 13.9126,
      lng: 100.6068,
    });
    const center = resolveCityCenter(d);
    expect(center).not.toBeNull();
    expect(Math.abs(center!.lng - 100.502)).toBeLessThan(0.05);
  });

  it("buildMapDay drops airport logistics on sightseeing days", () => {
    const view = buildMapDay(
      plan([
        day({
          day: 4,
          city: "Tokyo",
          title: "Tokyo sights",
          lat: 35.676,
          lng: 139.65,
          mapPins: [
            { name: "Prihod na letališče", lat: 35.549, lng: 139.779, category: "airport" },
            { name: "Shinjuku Gyoen", lat: 35.685, lng: 139.71, category: "nature" },
            {
              name: "Shinjuku Gyoen National Garden",
              lat: 35.6851,
              lng: 139.7102,
              category: "nature",
            },
            { name: "Senso-ji", lat: 35.7148, lng: 139.7967, category: "sightseeing" },
          ],
        }),
      ]),
      4,
    );
    expect(view).not.toBeNull();
    expect(view!.pins.every((p) => p.category !== "airport")).toBe(true);
    expect(view!.pins.some((p) => /letališč|airport/i.test(p.name))).toBe(false);
    expect(view!.pins.filter((p) => /shinjuku/i.test(p.name)).length).toBeLessThanOrEqual(1);
    expect(view!.pins.length).toBeLessThanOrEqual(MAX_DAY_PINS);
  });

  it("buildMapDay draws inbound flight leg on travel day only", () => {
    const p = plan([
      day({
        day: 1,
        city: "Munich",
        title: "Odhod",
        lat: 48.137,
        lng: 11.575,
        inFlightDay: true,
        transportation: [
          { type: "flight", from: "MUC", to: "BKK", duration: "10h", estimatedPrice: 400 },
        ],
      }),
      day({
        day: 2,
        city: "Bangkok",
        title: "Prihod — mednarodni let",
        lat: 13.756,
        lng: 100.502,
        inFlightDay: true,
        transportation: [
          { type: "flight", from: "MUC", to: "BKK", duration: "10h", estimatedPrice: 400 },
        ],
      }),
      day({
        day: 3,
        city: "Bangkok",
        title: "Temples",
        lat: 13.756,
        lng: 100.502,
        mapPins: [{ name: "Wat Arun", lat: 13.7437, lng: 100.4888, category: "sightseeing" }],
      }),
    ]);

    const arrival = buildMapDay(p, 2);
    expect(arrival?.legIn?.mode).toBe("flight");
    expect(arrival?.legIn?.from.lat).toBeCloseTo(48.137, 1);
    expect(arrival?.legIn?.to.lng).toBeCloseTo(100.502, 1);

    const sights = buildMapDay(p, 3);
    expect(sights?.legIn).toBeUndefined();
    expect(sights?.center.lng).toBeCloseTo(100.502, 1);
  });

  it("buildMapDay ferry travel day gets ferry leg", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", lat: 7.88, lng: 98.392 }),
      day({
        day: 2,
        city: "Koh Phi Phi",
        title: "Trajekt na Phi Phi",
        lat: 7.7407,
        lng: 98.7784,
        transportation: [
          { type: "ferry", from: "Phuket", to: "Phi Phi", duration: "2h", estimatedPrice: 30 },
        ],
      }),
    ]);
    const view = buildMapDay(p, 2);
    expect(view?.legIn?.mode).toBe("ferry");
    expect(view?.center.lat).toBeCloseTo(7.74, 1);
  });

  it("cameraForMapDay stays on city center", () => {
    const view = buildMapDay(
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
    const cam = cameraForMapDay(view);
    expect(cam.center).toEqual([view.center.lng, view.center.lat]);
  });

  it("collectPins pulls imageUrl from matching activity when pin lacks photo", () => {
    const view = buildMapDay(
      plan([
        day({
          day: 2,
          city: "Ubud",
          lat: -8.506,
          lng: 115.263,
          mapPins: [
            {
              name: "Tegallalang Rice Terraces",
              lat: -8.4312,
              lng: 115.2792,
              category: "nature",
            },
          ],
          activities: {
            morning: [
              {
                name: "Tegallalang Rice Terraces",
                type: "ATTRACTION",
                imageUrl: "https://images.example/tegallalang.jpg",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ]),
      2,
    );
    expect(view?.pins[0]?.imageUrl).toBe("https://images.example/tegallalang.jpg");
  });

  it("finalizeItineraryMapCoords rewrites runway AI lat/lng to city center", () => {
    const p = plan([
      day({
        day: 4,
        city: "Tokyo",
        title: "Parks",
        lat: 35.549,
        lng: 139.779,
        mapPins: [
          { name: "Airport", lat: 35.549, lng: 139.779, category: "airport" },
          { name: "Senso-ji", lat: 35.7148, lng: 139.7967, category: "sightseeing" },
        ],
      }),
    ]);
    finalizeItineraryMapCoords(p);
    expect(p.days[0]!.lng).toBeCloseTo(139.65, 1);
    expect(p.days[0]!.lat).toBeGreaterThan(35.65);
    expect(p.days[0]!.mapPins?.some((x) => x.category === "airport")).toBeFalsy();
    expect(p.days[0]!.mapPins?.some((x) => /senso/i.test(x.name))).toBe(true);
  });
});
