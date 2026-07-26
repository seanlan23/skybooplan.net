import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  buildMapDay,
  buildMotorhomeOverviewLegs,
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

  it("backfills activities even when Gemini returned a single mapPin", () => {
    const md = buildMapDay(
      plan([
        day({
          day: 2,
          city: "Lisbon",
          lat: 38.722,
          lng: -9.139,
          mapPins: [
            { name: "Praça do Comércio", lat: 38.707, lng: -9.136, category: "sightseeing" },
          ],
          activities: {
            morning: [
              {
                name: "Alfama walk",
                type: "SIGHT",
                description: "Old town",
                lat: 38.712,
                lng: -9.13,
              },
            ],
            afternoon: [
              {
                name: "Belém tower",
                type: "SIGHT",
                description: "Tower",
                lat: 38.6916,
                lng: -9.216,
              },
            ],
            evening: [
              {
                name: "LX Factory",
                type: "SIGHT",
                lat: 38.7036,
                lng: -9.1789,
              },
            ],
          },
        }),
      ]),
      2,
    );
    expect(md).not.toBeNull();
    // Gemini's single pin + activity backfill (nearby POIs may co-locate/merge).
    expect(md!.pins.length).toBeGreaterThanOrEqual(3);
    expect(md!.pins.some((p) => /belém|belem/i.test(p.name))).toBe(true);
    expect(md!.pins.some((p) => /lx factory/i.test(p.name))).toBe(true);
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

  it("does not merge train + dinner when Gemini dumps same coords", () => {
    const view = buildMapDay(
      plan([
        day({
          day: 5,
          city: "Ayutthaya",
          title: "Journey to Ancient Ayutthaya",
          lat: 14.369,
          lng: 100.588,
          activities: {
            morning: [
              {
                name: "Travel to Ayutthaya by train",
                description: "Hua Lamphong train",
                type: "train",
                lat: 14.369,
                lng: 100.588,
              },
            ],
            evening: [
              {
                name: "Sunset views and dinner",
                description: "Local dinner",
                type: "food",
                lat: 14.369,
                lng: 100.588,
              },
            ],
          },
        }),
      ]),
      5,
    );
    expect(view).not.toBeNull();
    expect(view!.pins.length).toBeGreaterThanOrEqual(2);
    expect(view!.pins.some((p) => /train/i.test(p.name))).toBe(true);
    expect(view!.pins.some((p) => /sunset|dinner/i.test(p.name))).toBe(true);
    const train = view!.pins.find((p) => /train/i.test(p.name))!;
    expect(train.name).not.toMatch(/sunset|dinner/i);
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

  it("buildMapDay cameras on origin city when day-1 lists home-airport logistics", () => {
    const p = {
      ...plan([
        day({
          day: 1,
          city: "Toronto",
          title: "Arrival in Toronto and Evening Stroll",
          lat: 43.65,
          lng: -79.38,
          activities: {
            morning: [
              {
                name: "Departure: Munich (MUC)",
                type: "TRANSPORT",
                description: "Home airport Munich (MUC), flight departs 15:00.",
              },
              {
                name: "Check-in and security",
                type: "TRANSPORT",
                description: "Clear security at MUC before 15:00.",
              },
            ],
            afternoon: [],
            evening: [
              {
                name: "Evening stroll",
                type: "SIGHT",
                description: "Harbourfront",
                lat: 43.64,
                lng: -79.38,
              },
            ],
          },
        }),
      ]),
      originIata: "MUC",
      destinationIata: "YYZ",
      destinationName: "Toronto",
    } as AiTripPlan;

    const view = buildMapDay(p, 1);
    expect(view?.cityLabel).toMatch(/Munich/i);
    expect(view?.center.lat).toBeCloseTo(48.137, 1);
    expect(view?.center.lng).toBeCloseTo(11.575, 1);
    expect(view?.legIn?.mode).toBe("flight");
    expect(view?.legIn?.to.lat).toBeCloseTo(43.65, 0);
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

  it("resolves camp activity coords from catalog on motorhome nights", () => {
    const view = buildMapDay(
      {
        ...plan([
          day({
            day: 2,
            city: "Vienna",
            activities: {
              morning: [],
              afternoon: [],
              evening: [
                {
                  name: "Camping Wien West overnight",
                  type: "HOTEL",
                  description: "RV park outside centre",
                },
              ],
            },
          }),
        ]),
        groundTransportMode: "motorhome",
        accommodationMode: "motorhome",
      } as AiTripPlan,
      2,
    );
    expect(view?.pins.some((p) => /wien west|camping/i.test(p.name))).toBe(true);
    const camp = view!.pins.find((p) => /camping|wien west/i.test(p.name))!;
    expect(camp.lat).toBeCloseTo(48.205, 2);
    expect(camp.category).toBe("hotel");
  });

  it("draws drive legIn between motorhome city hops without flight-day title", () => {
    const view = buildMapDay(
      {
        ...plan([
          day({ day: 1, city: "Vienna", title: "Vienna camps" }),
          day({ day: 2, city: "Munich", title: "Munich camps" }),
        ]),
        groundTransportMode: "motorhome",
        accommodationMode: "motorhome",
      } as AiTripPlan,
      2,
    );
    expect(view?.legIn?.mode).toBe("drive");
    expect(view?.legIn?.from.lat).toBeCloseTo(48.2, 0);
    expect(view?.legIn?.to.lat).toBeCloseTo(48.1, 0);
  });

  it("motorhome day-1 cameras on originPlace, not first overnight city", () => {
    const view = buildMapDay(
      {
        ...plan([
          day({
            day: 1,
            city: "Salzburg",
            title: "Odhod iz Slovenj Gradca in vožnja do Salzburga",
            lat: 47.809,
            lng: 13.055,
            activities: {
              morning: [
                {
                  name: "Odhod iz Slovenj Gradca",
                  type: "TRANSPORT",
                  description: "Začetek poti iz Slovenj Gradca.",
                },
              ],
              afternoon: [
                {
                  name: "Postanek in kosilo na poti",
                  type: "EAT",
                  description: "Kosilo v Salzburgu.",
                },
              ],
              evening: [],
            },
          }),
        ]),
        groundTransportMode: "motorhome",
        accommodationMode: "motorhome",
        originPlace: "Slovenj Gradec, SI",
      } as AiTripPlan,
      1,
    );
    expect(view?.cityLabel).toMatch(/Slovenj Gradec/i);
    expect(view?.center.lat).toBeCloseTo(46.509, 1);
    expect(view?.center.lng).toBeCloseTo(15.08, 1);
    expect(view?.legIn?.mode).toBe("drive");
    expect(view?.legIn?.to.lat).toBeCloseTo(47.809, 1);
    expect(view?.legIn?.from.lat).toBeCloseTo(46.509, 1);
  });

  it("buildMotorhomeOverviewLegs links consecutive road-trip cities", () => {
    const legs = buildMotorhomeOverviewLegs({
      ...plan([
        day({ day: 1, city: "Vienna" }),
        day({ day: 2, city: "Vienna" }),
        day({ day: 3, city: "Munich" }),
        day({ day: 4, city: "Ljubljana" }),
      ]),
      groundTransportMode: "motorhome",
      accommodationMode: "motorhome",
    } as AiTripPlan);
    expect(legs.length).toBeGreaterThanOrEqual(2);
    expect(legs.every((l) => l.mode === "drive")).toBe(true);
  });

  it("does not seed camp hubs on hotel flights trips", () => {
    const view = buildMapDay(
      plan([
        day({
          day: 1,
          city: "Vienna",
          activities: {
            morning: [{ name: "Stephansdom", type: "SIGHT", description: "Cathedral" }],
            afternoon: [],
            evening: [],
          },
        }),
      ]),
      1,
    );
    expect(view?.pins.some((p) => /camping/i.test(p.name))).toBe(false);
  });
});
