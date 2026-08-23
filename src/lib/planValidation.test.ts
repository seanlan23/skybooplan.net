import { describe, it, expect } from "vitest";
import type { AiTripPlan, DayPlan } from "./aiPlan.functions";
import {
  distanceKm,
  findDuplicateActivities,
  findDuplicateCitySegments,
  findDuplicateDayNumbers,
  findMissingTravelBlocks,
  findThinLongAccessStays,
  findAbandonedRegionReturn,
  findReplayedArrivals,
  findHollowActivities,
  findImpossibleArrivals,
  findNonLinearRoute,
  findOverpackedDays,
  findSameDayFarPois,
  dropSameDayFarPois,
  validateItinerary,
} from "./planValidation";

const day = (overrides: Partial<DayPlan>): DayPlan => ({
  day: 1,
  date: "2026-07-01",
  title: "Day",
  morning: "",
  afternoon: "",
  evening: "",
  travelHack: "",
  transportationTips: "",
  localWarnings: "",
  dailyBudgetEur: 100,
  lat: 0,
  lng: 0,
  focusName: "",
  city: "",
  category: "sight",
  ...overrides,
});

const plan = (days: DayPlan[]): AiTripPlan => ({
  destinationName: "Test",
  summary: "",
  totalBudgetEur: 0,
  centerLat: days[0]?.lat ?? 0,
  centerLng: days[0]?.lng ?? 0,
  days,
});

// Reference coordinates for realistic Thailand-style fixtures.
const PHUKET = { lat: 7.88, lng: 98.4 };
const PHI_PHI = { lat: 7.74, lng: 98.77 };
const KRABI = { lat: 8.05, lng: 98.92 };
const KOH_SAMUI = { lat: 9.51, lng: 100.0 };
const KOH_PHANGAN = { lat: 9.74, lng: 100.02 };
const BANGKOK = { lat: 13.75, lng: 100.5 };
const CHIANG_MAI = { lat: 18.79, lng: 98.99 };
const LJUBLJANA = { lat: 46.06, lng: 14.51 };

describe("distanceKm", () => {
  it("computes Phuket → Koh Samui as a long hop (>250km)", () => {
    expect(distanceKm(PHUKET, KOH_SAMUI)).toBeGreaterThan(250);
  });
  it("computes Phuket → Phi Phi as a short hop (<100km)", () => {
    expect(distanceKm(PHUKET, PHI_PHI)).toBeLessThan(100);
  });
});

describe("findDuplicateDayNumbers", () => {
  it("flags repeated day numbers", () => {
    const p = plan([day({ day: 1 }), day({ day: 2 }), day({ day: 2 })]);
    expect(findDuplicateDayNumbers(p)).toHaveLength(1);
  });
  it("passes on sequential days", () => {
    const p = plan([1, 2, 3, 4].map((d) => day({ day: d })));
    expect(findDuplicateDayNumbers(p)).toEqual([]);
  });
});

describe("findDuplicateCitySegments — no duplicate non-contiguous stays", () => {
  it("allows multi-day contiguous stays in one city", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", ...PHUKET }),
      day({ day: 2, city: "Phuket", ...PHUKET }),
      day({ day: 3, city: "Krabi", ...KRABI }),
    ]);
    expect(findDuplicateCitySegments(p)).toEqual([]);
  });

  it("flags a destination revisited later (Phuket → Krabi → Phuket)", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", ...PHUKET }),
      day({ day: 2, city: "Krabi", ...KRABI }),
      day({ day: 3, city: "Phuket", ...PHUKET }),
    ]);
    const v = findDuplicateCitySegments(p);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("duplicate_destination_segment");
  });

  it("allows return to hub city on final 1–2 days (Bangkok → islands → Bangkok)", () => {
    const days: DayPlan[] = [
      ...[1, 2, 3].map((d) => day({ day: d, city: "Bangkok", ...BANGKOK })),
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((d) =>
        day({ day: d, city: "Phuket", ...PHUKET }),
      ),
      day({ day: 13, city: "Bangkok", ...BANGKOK }),
      day({ day: 14, city: "Bangkok", ...BANGKOK }),
    ];
    expect(findDuplicateCitySegments(plan(days))).toEqual([]);
  });

  it("allows hub return when day 1 is in-flight and Bangkok starts day 2", () => {
    const days: DayPlan[] = [
      day({ day: 1, city: "En route", lat: 20, lng: 100, category: "transport" }),
      day({ day: 2, city: "Bangkok", ...BANGKOK }),
      ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((d) =>
        day({ day: d, city: "Chiang Mai", lat: 18.8, lng: 98.9 }),
      ),
      ...[16, 17, 18].map((d) => day({ day: d, city: "Bangkok", ...BANGKOK })),
    ];
    expect(findDuplicateCitySegments(plan(days))).toEqual([]);
  });

  it("flags padded Gaborone return (capital shopping days before flight)", () => {
    const GAB = { lat: -24.555, lng: 25.918 };
    const MAUN = { lat: -19.973, lng: 23.431 };
    const days: DayPlan[] = [
      ...[1, 2, 3].map((d) => day({ day: d, city: "Gaborone", ...GAB })),
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((d) => day({ day: d, city: "Maun", ...MAUN })),
      ...[13, 14, 15, 16].map((d) => day({ day: d, city: "Gaborone", ...GAB })),
    ];
    const v = findDuplicateCitySegments(plan(days));
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("duplicate_destination_segment");
  });

  it("allows thin Gaborone hub return (1 night in + 1–2 nights out)", () => {
    const GAB = { lat: -24.555, lng: 25.918 };
    const MAUN = { lat: -19.973, lng: 23.431 };
    const days: DayPlan[] = [
      day({ day: 1, city: "Gaborone", ...GAB }),
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((d) =>
        day({ day: d, city: "Maun", ...MAUN }),
      ),
      day({ day: 15, city: "Gaborone", ...GAB }),
      day({ day: 16, city: "Gaborone", ...GAB }),
    ];
    expect(findDuplicateCitySegments(plan(days))).toEqual([]);
  });

  it("still flags mid-trip hub return (Bangkok → Chiang Mai → Bangkok → Phuket)", () => {
    const days: DayPlan[] = [
      day({ day: 1, city: "Bangkok", ...BANGKOK }),
      day({ day: 2, city: "Chiang Mai", lat: 18.8, lng: 98.9 }),
      day({ day: 3, city: "Bangkok", ...BANGKOK }),
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((d) =>
        day({ day: d, city: "Phuket", ...PHUKET }),
      ),
      day({ day: 14, city: "Bangkok", ...BANGKOK }),
    ];
    const v = findDuplicateCitySegments(plan(days));
    expect(v).toHaveLength(1);
    expect(v[0].dayNumbers).toContain(3);
  });
});

describe("findMissingTravelBlocks — realistic travel time", () => {
  it("flags an inter-region jump without a transport block", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", ...PHUKET, category: "sight" }),
      day({ day: 2, city: "Koh Samui", ...KOH_SAMUI, category: "beach" }),
    ]);
    const v = findMissingTravelBlocks(p);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("missing_travel_block");
  });

  it("flags an island hop with only an arrow title and no legs", () => {
    const p = plan([
      day({ day: 1, city: "Nusa Lembongan", lat: -8.679, lng: 115.451, category: "sight" }),
      day({
        day: 2,
        city: "Uluwatu",
        lat: -8.829,
        lng: 115.084,
        title: "Nusa Lembongan →.",
        category: "sight",
      }),
    ]);
    expect(findMissingTravelBlocks(p)[0]?.rule).toBe("missing_travel_block");
  });

  it("accepts a transport day between distant regions", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", ...PHUKET, category: "sight" }),
      day({
        day: 2,
        city: "Surat Thani",
        lat: 9.14,
        lng: 99.33,
        category: "transport",
      }),
      day({ day: 3, city: "Koh Samui", ...KOH_SAMUI, category: "beach" }),
    ]);
    // The day-2 → day-3 hop is short; day-1 → day-2 is the long one and has
    // category=transport, so no violation.
    expect(findMissingTravelBlocks(p)).toEqual([]);
  });

  it("accepts a structured transport block on the destination day itself", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", ...PHUKET }),
      day({
        day: 2,
        city: "Koh Samui",
        ...KOH_SAMUI,
        category: "beach",
        transport: {
          type: "flight",
          duration: "1h",
          cost: "60 EUR",
          description: "HKT → USM",
        },
      }),
    ]);
    expect(findMissingTravelBlocks(p)).toEqual([]);
  });

  it("accepts catalog transportation[] as a travel block", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", ...PHUKET }),
      day({
        day: 2,
        city: "Koh Samui",
        ...KOH_SAMUI,
        category: "beach",
        transportation: [
          {
            type: "flight",
            from: "Phuket",
            to: "Koh Samui",
            duration: "1h",
            estimatedPrice: 60,
          },
        ],
      }),
    ]);
    expect(findMissingTravelBlocks(p)).toEqual([]);
  });
});

describe("findThinLongAccessStays", () => {
  const LIPE = { lat: 6.49, lng: 99.3 };

  it("flags a 2-night Koh Lipe stay", () => {
    const p = plan([
      day({ day: 1, city: "Krabi", ...KRABI }),
      day({ day: 2, city: "Krabi", ...KRABI }),
      day({ day: 3, city: "Krabi", ...KRABI }),
      day({ day: 4, city: "Koh Lipe", ...LIPE }),
      day({ day: 5, city: "Koh Lipe", ...LIPE }),
      day({ day: 6, city: "Bangkok", ...BANGKOK }),
    ]);
    const v = findThinLongAccessStays(p);
    expect(v.some((x) => x.rule === "thin_long_access" && /Lipe/i.test(x.message))).toBe(
      true,
    );
  });

  it("passes when Lipe has 4 hotel nights", () => {
    const p = plan([
      day({ day: 1, city: "Krabi", ...KRABI }),
      day({ day: 2, city: "Krabi", ...KRABI }),
      day({ day: 3, city: "Krabi", ...KRABI }),
      day({ day: 4, city: "Koh Lipe", ...LIPE }),
      day({ day: 5, city: "Koh Lipe", ...LIPE }),
      day({ day: 6, city: "Koh Lipe", ...LIPE }),
      day({ day: 7, city: "Koh Lipe", ...LIPE }),
      day({ day: 8, city: "Bangkok", ...BANGKOK }),
    ]);
    expect(findThinLongAccessStays(p).filter((x) => /Lipe/i.test(x.message))).toEqual([]);
  });
});

describe("findNonLinearRoute — linear A→B→C flow", () => {
  it("passes for a clustered Andaman-coast loop", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", ...PHUKET }),
      day({ day: 2, city: "Phi Phi", ...PHI_PHI }),
      day({ day: 3, city: "Krabi", ...KRABI }),
    ]);
    expect(findNonLinearRoute(p)).toEqual([]);
  });

  it("flags backtracking Phuket → Bangkok → Phuket → Krabi", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", ...PHUKET }),
      day({ day: 2, city: "Bangkok", ...BANGKOK }),
      day({ day: 3, city: "Phuket", ...PHUKET }),
      day({ day: 4, city: "Krabi", ...KRABI }),
    ]);
    const v = findNonLinearRoute(p);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("non_linear_route");
  });

  it("flags coast-jumping Phuket → Koh Phangan → Krabi → Koh Samui (zig-zag)", () => {
    const p = plan([
      day({ day: 1, city: "Phuket", ...PHUKET }),
      day({ day: 2, city: "Koh Phangan", ...KOH_PHANGAN, category: "transport" }),
      day({ day: 3, city: "Krabi", ...KRABI, category: "transport" }),
      day({ day: 4, city: "Koh Samui", ...KOH_SAMUI, category: "transport" }),
    ]);
    expect(findNonLinearRoute(p).length).toBeGreaterThan(0);
  });

  it("flags south→north→south even when day 1 is the origin airport", () => {
    const p = plan([
      day({ day: 1, city: "Ljubljana", ...LJUBLJANA, inFlightDay: true }),
      day({ day: 2, city: "Bangkok", ...BANGKOK }),
      day({ day: 5, city: "Krabi", ...KRABI }),
      day({ day: 8, city: "Phuket", ...PHUKET }),
      day({ day: 11, city: "Chiang Mai", ...CHIANG_MAI }),
      day({ day: 13, city: "Koh Samui", ...KOH_SAMUI }),
      day({ day: 15, city: "Bangkok", ...BANGKOK }),
    ]);
    const v = findAbandonedRegionReturn(p);
    expect(v[0]?.rule).toBe("non_linear_route");
    expect(v[0]?.message).toMatch(/zigzag|abandoned/i);
  });

  it("allows hub → north → south → hub (one long-axis change)", () => {
    const p = plan([
      day({ day: 1, city: "Ljubljana", ...LJUBLJANA, inFlightDay: true }),
      day({ day: 2, city: "Bangkok", ...BANGKOK }),
      day({ day: 5, city: "Chiang Mai", ...CHIANG_MAI }),
      day({ day: 8, city: "Krabi", ...KRABI }),
      day({ day: 11, city: "Phuket", ...PHUKET }),
      day({ day: 15, city: "Bangkok", ...BANGKOK }),
    ]);
    expect(findAbandonedRegionReturn(p)).toEqual([]);
  });

  it("flags coast → far island → same coast even when haversine is under 500km", () => {
    const SEMINYAK = { lat: -8.691, lng: 115.168 };
    const ULUWATU = { lat: -8.829, lng: 115.084 };
    const GILI = { lat: -8.348, lng: 116.037 };
    const CANGGU = { lat: -8.648, lng: 115.138 };
    const p = plan([
      day({ day: 1, city: "Seminyak", ...SEMINYAK }),
      day({ day: 3, city: "Uluwatu", ...ULUWATU }),
      day({ day: 4, city: "Gili Trawangan", ...GILI }),
      day({ day: 7, city: "Canggu", ...CANGGU }),
    ]);
    const v = findAbandonedRegionReturn(p);
    expect(v[0]?.rule).toBe("non_linear_route");
    expect(v[0]?.message).toMatch(/island crossing|abandoned/i);
  });

  it("allows one coast plus a nearby island without calling it a zigzag", () => {
    const SEMINYAK = { lat: -8.691, lng: 115.168 };
    const UBUD = { lat: -8.507, lng: 115.262 };
    const LEMBONGAN = { lat: -8.679, lng: 115.451 };
    const ULUWATU = { lat: -8.829, lng: 115.084 };
    const p = plan([
      day({ day: 1, city: "Seminyak", ...SEMINYAK }),
      day({ day: 3, city: "Ubud", ...UBUD }),
      day({ day: 5, city: "Nusa Lembongan", ...LEMBONGAN }),
      day({ day: 8, city: "Uluwatu", ...ULUWATU }),
    ]);
    expect(findAbandonedRegionReturn(p)).toEqual([]);
  });
});

describe("findReplayedArrivals", () => {
  it("flags the same internal flight on two consecutive days", () => {
    const p = plan([
      day({
        day: 11,
        city: "Chiang Mai",
        ...CHIANG_MAI,
        activities: {
          morning: [
            {
              name: "Notranji let Phuket → Chiang Mai",
              type: "TRANSPORT",
              transportType: "flight",
              description: "HKT → CNX",
            },
          ],
        },
      }),
      day({
        day: 12,
        city: "Chiang Mai",
        ...CHIANG_MAI,
        activities: {
          morning: [
            {
              name: "Notranji let Phuket (HKT) → Chiang Mai (CNX)",
              type: "TRANSPORT",
              transportType: "flight",
              description: "Notranji let Phuket (HKT) → Chiang Mai (CNX)",
            },
          ],
        },
      }),
    ]);
    const v = findReplayedArrivals(p);
    expect(v[0]?.rule).toBe("replayed_arrival");
    expect(v[0]?.dayNumbers).toEqual([11, 12]);
  });

  it("flags let iz Krabija v Bangkok replayed on the next day", () => {
    const p = plan([
      day({
        day: 13,
        city: "Bangkok",
        ...BANGKOK,
        transportation: [
          { type: "flight", from: "Krabi", to: "Bangkok", duration: "1h 20m", estimatedPrice: 60 },
        ],
      }),
      day({
        day: 14,
        city: "Bangkok",
        ...BANGKOK,
        activities: {
          morning: [
            {
              name: "Notranji let iz Krabija v Bangkok",
              type: "SIGHT",
              description: "Jutranji let KBV → BKK.",
            },
          ],
        },
      }),
    ]);
    expect(findReplayedArrivals(p)[0]?.rule).toBe("replayed_arrival");
  });
});

describe("findHollowActivities", () => {
  it("flags Visit Railay Beach without a description", () => {
    const p = plan([
      day({ day: 8, city: "Krabi", ...KRABI }),
      day({
        day: 9,
        city: "Krabi",
        ...KRABI,
        activities: {
          morning: [{ name: "Visit Railay Beach", type: "SIGHT" }],
        },
      }),
      day({ day: 10, city: "Krabi", ...KRABI }),
    ]);
    expect(findHollowActivities(p)[0]?.rule).toBe("hollow_activity");
  });
});

describe("findImpossibleArrivals", () => {
  it("flags hotel 08:55 after 06:40 LJU on a Bangkok day", () => {
    const p = {
      ...plan([
        day({
          day: 1,
          city: "Bangkok",
          ...BANGKOK,
          activities: {
            morning: [
              {
                name: "Mednarodni let (LJU) 06:40",
                type: "TRANSPORT",
                description: "Odhod 06:40 z LJU.",
              },
              {
                name: "Prevoz do hotela 08:55",
                type: "TRANSPORT",
                description: "Transfer.",
              },
            ],
          },
        }),
      ]),
      originIata: "LJU",
    };
    expect(findImpossibleArrivals(p)[0]?.rule).toBe("impossible_arrival");
  });
});

describe("findDuplicateActivities — no repeated sightseeing", () => {
  it("flags the same focusName on two different days", () => {
    const p = plan([
      day({ day: 1, city: "Manila", focusName: "Intramuros" }),
      day({ day: 2, city: "Manila", focusName: "Intramuros" }),
    ]);
    const v = findDuplicateActivities(p);
    expect(v.some((x) => x.message.toLowerCase().includes("intramuros"))).toBe(
      true,
    );
  });

  it("flags duplicates inside the structured activities[] slots", () => {
    const slot = [{ name: "Fort Santiago", description: "" }];
    const p = plan([
      day({ day: 1, city: "Manila", activities: { morning: slot } }),
      day({ day: 2, city: "Manila", activities: { afternoon: slot } }),
    ]);
    const v = findDuplicateActivities(p);
    expect(v.some((x) => x.message.toLowerCase().includes("fort santiago"))).toBe(
      true,
    );
  });

  it("passes when every day has unique attractions", () => {
    const p = plan([
      day({ day: 1, city: "Manila", focusName: "Intramuros" }),
      day({ day: 2, city: "Cebu", focusName: "Magellan's Cross" }),
    ]);
    expect(findDuplicateActivities(p)).toEqual([]);
  });
});

describe("validateItinerary — end-to-end on a realistic Thailand plan", () => {
  it("passes for a properly clustered, linear, deduped 6-day plan", () => {
    const good = plan([
      day({
        day: 1,
        city: "Phuket",
        ...PHUKET,
        focusName: "Old Town walk",
        category: "sight",
      }),
      day({
        day: 2,
        city: "Phi Phi",
        ...PHI_PHI,
        focusName: "Maya Bay",
        category: "beach",
      }),
      day({
        day: 3,
        city: "Krabi",
        ...KRABI,
        focusName: "Railay cliffs",
        category: "nature",
      }),
      day({
        day: 4,
        city: "Surat Thani",
        lat: 9.14,
        lng: 99.33,
        focusName: "Ferry transfer",
        category: "transport",
      }),
      day({
        day: 5,
        city: "Koh Samui",
        ...KOH_SAMUI,
        focusName: "Chaweng beach",
        category: "beach",
      }),
      day({
        day: 6,
        city: "Koh Phangan",
        ...KOH_PHANGAN,
        focusName: "Bottle Beach",
        category: "beach",
      }),
    ]);
    expect(validateItinerary(good)).toEqual([]);
  });

  it("catches multiple violations on a deliberately broken plan", () => {
    const bad = plan([
      day({
        day: 1,
        city: "Phuket",
        ...PHUKET,
        focusName: "Old Town",
      }),
      day({
        day: 2,
        city: "Koh Samui",
        ...KOH_SAMUI,
        focusName: "Chaweng",
        category: "beach",
      }), // long hop, no transport
      day({
        day: 2, // duplicate day number
        city: "Phuket",
        ...PHUKET,
        focusName: "Old Town", // duplicate activity
      }),
      day({
        day: 4,
        city: "Bangkok",
        ...BANGKOK,
        focusName: "Grand Palace",
      }), // backtracking
    ]);
    const v = validateItinerary(bad);
    const rules = new Set(v.map((x) => x.rule));
    expect(rules.has("duplicate_day_number")).toBe(true);
    expect(rules.has("missing_travel_block")).toBe(true);
    expect(rules.has("duplicate_destination_segment")).toBe(true);
    expect(rules.has("duplicate_activity")).toBe(true);
  });
});

describe("day feasibility", () => {
  it("flags more than four program items on a full day", () => {
    const sight = (name: string) => ({
      name,
      type: "SIGHT" as const,
      description: "Ogled.",
    });
    const p = plan([
      day({
        day: 2,
        city: "Paris",
        lat: 48.86,
        lng: 2.35,
        activities: {
          morning: [sight("Louvre"), sight("Orsay")],
          afternoon: [sight("Notre-Dame"), sight("Sainte-Chapelle")],
          evening: [sight("Eiffel Tower")],
        },
      }),
    ]);
    expect(findOverpackedDays(p)[0]?.rule).toBe("overpacked_day");
  });

  it("flags two sights 400km apart with no transfer", () => {
    const p = plan([
      day({
        day: 3,
        city: "Bangkok",
        ...BANGKOK,
        activities: {
          morning: [
            {
              name: "Grand Palace",
              type: "SIGHT",
              lat: 13.75,
              lng: 100.49,
              description: "Tempelj.",
            },
          ],
          afternoon: [
            {
              name: "Doi Suthep",
              type: "SIGHT",
              lat: 18.8,
              lng: 98.92,
              description: "Chiang Mai.",
            },
          ],
          evening: [],
        },
      }),
    ]);
    expect(findSameDayFarPois(p)[0]?.rule).toBe("same_day_far_pois");
    expect(dropSameDayFarPois(p)).toBe(1);
    expect(JSON.stringify(p.days[0]!.activities)).not.toMatch(/Doi Suthep/);
  });
});
