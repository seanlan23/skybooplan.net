import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  alignTransportationDurationWithTips,
  applyItineraryGuards,
  relocateClosedEveningSights,
  dedupeLastDayReturnFlights,
  dedupeNearIdenticalConsecutiveDays,
  dedupeSameDayMeals,
  isEnricherPlaceholderActivity,
  isGenericMealActivity,
  repairIncompleteLogisticsCopy,
  sanitizeTransportationLegs,
  scrubUnsafeEarlyAirportTips,
  stripGenericMealActivities,
  stripPhantomArrivals,
  stripPlaceholderActivities,
  stripWrongCityDayActivities,
  dropDuplicatePoisAcrossPlan,
  ensureCityChangeTransfer,
} from "@/lib/itineraryGuards";
import { repairTruncatedCopy } from "@/lib/textSanitize";

function day(partial: Partial<DayPlan> & { day: number }): DayPlan {
  return {
    title: `Day ${partial.day}`,
    city: partial.city ?? "Panama City",
    lat: 8.98,
    lng: -79.52,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 80,
    ...partial,
  } as DayPlan;
}

describe("isEnricherPlaceholderActivity", () => {
  it("flags generic morning enricher copy", () => {
    expect(
      isEnricherPlaceholderActivity({
        name: "Jutranji ogled / sprehod",
        description:
          "Glavni dopoldanski ogled — mesto ali znamenitost, ki jo je najbolje obiskati zjutraj.",
      }),
    ).toBe(true);
  });

  it("flags German enricher scaffold from Japan PDF", () => {
    expect(
      isEnricherPlaceholderActivity({
        name: "Morgendliche Besichtigung oder Spaziergang",
        description:
          "Hauptbesichtigung am Vormittag — Ort oder Sehenswürdigkeit am besten früh morgens besuchen.",
      }),
    ).toBe(true);
  });

  it("flags hotel-grounds stroll filler", () => {
    expect(
      isEnricherPlaceholderActivity({
        name: "Sprehod okoli hotela",
        description: "Lahkoten sprehod v okolici vaše namestitve za spoznavanje s prvim okoljem.",
      }),
    ).toBe(true);
  });

  it("keeps real Casco Viejo sightseeing", () => {
    expect(
      isEnricherPlaceholderActivity({
        name: "Raziskovanje Casco Vieja",
        description: "Sprehod po starem mestnem jedru in Plaza de la Independencia.",
      }),
    ).toBe(false);
  });
});

describe("isGenericMealActivity", () => {
  it("strips venue-less city meals worldwide", () => {
    expect(isGenericMealActivity({ name: "Abendessen in Kyoto", type: "EAT" })).toBe(true);
    expect(isGenericMealActivity({ name: "Mittagessen in Asakusa", type: "EAT" })).toBe(true);
    expect(isGenericMealActivity({ name: "Lunch in Harajuku", type: "EAT" })).toBe(true);
    expect(isGenericMealActivity({ name: "Lokalna večerja", type: "EAT" })).toBe(true);
  });

  it("keeps named venues", () => {
    expect(isGenericMealActivity({ name: "Večerja: Ichiran Ramen", type: "EAT" })).toBe(false);
    expect(isGenericMealActivity({ name: "Dinner at Sukiyabashi Jiro", type: "EAT" })).toBe(false);
    expect(isGenericMealActivity({ name: "Abendessen: Kyubey", type: "EAT" })).toBe(false);
  });

  it("strips elegant-bar cocktail fillers and leaves evening empty", () => {
    expect(
      isGenericMealActivity({
        name: "Večerja in koktajli v elegantnem baru",
        type: "EAT",
        description: "Uživajte v elegantni večerji v restavraciji v bližini hotela.",
      }),
    ).toBe(true);
    const plan = {
      destinationName: "France",
      contentLanguage: "sl",
      days: [
        day({
          day: 2,
          city: "Paris",
          activities: {
            morning: [{ name: "Eiffel Tower", type: "SIGHT" }],
            afternoon: [],
            evening: [
              {
                name: "Večerja in koktajli v elegantnem baru",
                type: "EAT",
                description: "Koktajli v enem izmed številnih stilskih pariških barov.",
              },
            ],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripGenericMealActivities(plan)).toBe(1);
    expect(plan.days[0]!.activities!.evening).toEqual([]);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Eiffel/i);
  });

  it("removes generic meals from a Japan-style day", () => {
    const plan = {
      destinationName: "Japan",
      days: [
        day({
          day: 2,
          city: "Tokyo",
          activities: {
            morning: [{ name: "Senso-ji", type: "SIGHT", description: "Tempel." }],
            afternoon: [{ name: "Mittagessen in Asakusa", type: "EAT", description: "Essen." }],
            evening: [
              { name: "Abendessen in Ueno", type: "EAT", description: "Essen." },
              { name: "Večerja: Ichiran", type: "EAT", description: "Ramen." },
            ],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripGenericMealActivities(plan)).toBe(2);
    expect(plan.days[0]!.activities!.afternoon).toHaveLength(0);
    expect(plan.days[0]!.activities!.evening).toHaveLength(1);
    expect(plan.days[0]!.activities!.evening[0]!.name).toMatch(/Ichiran/i);
  });

  it("strips neighbourhood/cuisine dinners and keeps a named restaurant", () => {
    expect(isGenericMealActivity({ name: "Večerja: Izakaya v Akihabari", type: "EAT" })).toBe(true);
    expect(isGenericMealActivity({ name: "Večerja: Kawaramachi Area", type: "EAT" })).toBe(true);
    expect(isGenericMealActivity({ name: "Večerja: Yakitori izkušnja v Ginzi", type: "EAT" })).toBe(
      true,
    );
    expect(isGenericMealActivity({ name: "Večerja: Nishiki Market", type: "EAT" })).toBe(true);
    expect(isGenericMealActivity({ name: "Večerja: Pontocho Alley", type: "EAT" })).toBe(true);
    expect(isGenericMealActivity({ name: "Večerja: Ramen v 'Ichiran Ramen'", type: "EAT" })).toBe(
      false,
    );
    expect(isGenericMealActivity({ name: "Večerja: Pontocho Yakitori AKIRA", type: "EAT" })).toBe(
      false,
    );
    expect(isGenericMealActivity({ name: "Kosilo: Arashiyama Yoshimura", type: "EAT" })).toBe(
      false,
    );
  });
});

describe("stripPlaceholderActivities", () => {
  it("drops check-in refresh and morning-walk-to-first-sight", () => {
    expect(
      isEnricherPlaceholderActivity({
        name: "Check-in, osvežitev in kratek odmor",
        description: "Če imaš še energijo, sprehod po soseski.",
      }),
    ).toBe(true);
    expect(
      isEnricherPlaceholderActivity({
        name: "Jutranji sprehod do prve znamenitosti",
        description: "Peš ali z javnim prevozom do prve točke dneva.",
      }),
    ).toBe(true);
    expect(
      isEnricherPlaceholderActivity({
        name: "Prihod v hotel",
        description: "Namestitev okoli 16:00. 1–2 uri počitka, potem samo lahek program.",
      }),
    ).toBe(false);
  });

  it("removes enricher placeholder mornings", () => {
    const plan = {
      destinationName: "Panama",
      days: [
        day({
          day: 7,
          activities: {
            morning: [
              {
                name: "Jutranji ogled / sprehod",
                type: "ACTIVITY",
                description:
                  "Glavni dopoldanski ogled — mesto ali znamenitost, ki jo je najbolje obiskati zjutraj.",
              },
              {
                name: "San Blas day prep",
                type: "ACTIVITY",
                description: "Priprava na izlet naslednji dan.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;

    expect(stripPlaceholderActivities(plan)).toBe(1);
    expect(plan.days[0]!.activities!.morning).toHaveLength(1);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/San Blas/i);
  });
});

describe("stripWrongCityDayActivities", () => {
  it("removes Louvre from a Lyon day", () => {
    const plan = {
      destinationName: "France",
      days: [
        day({
          day: 5,
          city: "Lyon",
          activities: {
            morning: [
              { name: "Louvre", type: "SIGHT", description: "Mona Lisa v Parizu." },
              { name: "Basilique Notre-Dame de Fourvière", type: "SIGHT", description: "Hrib nad Lyonom." },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripWrongCityDayActivities(plan)).toBe(1);
    expect(plan.days[0]!.activities!.morning).toHaveLength(1);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Fourvière/i);
  });

  it("keeps a Porto → Lisbon train on a Lisbon day", () => {
    const plan = {
      destinationName: "Portugal",
      days: [
        day({
          day: 9,
          city: "Lisbon",
          activities: {
            morning: [
              {
                name: "Vlak Porto → Lisbon",
                type: "TRANSPORT",
                description: "Alfa Pendular iz Porta.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripWrongCityDayActivities(plan)).toBe(0);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Porto/);
  });
});

describe("ensureCityChangeTransfer", () => {
  it("does not leave a Porto→Lisbon overnight as an empty teleport", () => {
    const plan = {
      destinationName: "Portugal",
      contentLanguage: "sl" as const,
      days: [
        day({ day: 8, city: "Porto", title: "Porto" }),
        day({
          day: 9,
          city: "Lisbon",
          title: "Potovanje v Lisbon",
          morning: "Prosti dan / raziskovanje okolice.",
        }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBe(1);
    expect(plan.days[1]!.activities!.morning[0]!.name).toBe("Porto → Lisbon");
    expect(plan.days[1]!.activities!.morning[0]!.type).toBe("TRANSPORT");
    expect(plan.days[1]!.activities!.morning[0]!.description).toMatch(/Porto → Lisbon/);
    expect(plan.days[1]!.activities!.morning[0]!.description).not.toMatch(/teleport/i);
    expect(plan.days[1]!.morning).toMatch(/Porto → Lisbon/);
    expect(plan.days[1]!.morning).not.toMatch(/Prosti dan/);
  });

  it("does not duplicate a train that is already on the city-change day", () => {
    const plan = {
      destinationName: "Portugal",
      days: [
        day({ day: 6, city: "Lisbon" }),
        day({
          day: 7,
          city: "Porto",
          activities: {
            morning: [
              {
                name: "Vožnja z vlakom Lizbona -> Porto",
                type: "TRANSPORT",
                description: "Hitri vlak ~3 h.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBe(0);
    expect(plan.days[1]!.activities!.morning).toHaveLength(1);
  });

  it("does not add a second hop when Gemini already wrote prevoz iz A do B", () => {
    const plan = {
      destinationName: "Mexico",
      contentLanguage: "sl" as const,
      days: [
        day({ day: 11, city: "Tulum" }),
        day({
          day: 12,
          city: "Isla Holbox",
          title: "Potovanje na Isla Holbox",
          activities: {
            morning: [
              {
                name: "Prevoz iz Tuluma do Chiquilá",
                type: "SIGHT",
                description: "Avtobus ali kombi do pristanišča.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBe(0);
    expect(plan.days[1]!.activities!.morning).toHaveLength(1);
  });

  it("does not invent a hop when consecutive nights stay in the same city", () => {
    const plan = {
      destinationName: "Portugal",
      days: [
        day({ day: 2, city: "Lisbon" }),
        day({ day: 3, city: "Lisboa" }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBe(0);
  });
});

describe("dedupeSameDayMeals", () => {
  it("keeps one evening dinner and drops the generic second", () => {
    const plan = {
      destinationName: "Panama",
      days: [
        day({
          day: 7,
          activities: {
            morning: [],
            afternoon: [],
            evening: [
              {
                name: "Sproščena večerja po vrnitvi",
                type: "EAT",
                description: "Po Emberá izletu.",
              },
              {
                name: "Lokalna večerja",
                type: "EAT",
                description: "Večerja v restavraciji, kamor hodijo domačini.",
              },
            ],
          },
        }),
      ],
    } as AiTripPlan;

    expect(dedupeSameDayMeals(plan)).toBe(1);
    expect(plan.days[0]!.activities!.evening).toHaveLength(1);
    expect(plan.days[0]!.activities!.evening[0]!.name).toMatch(/Sproščena/i);
  });
});

describe("stripPhantomArrivals", () => {
  it("removes Tocumen re-arrival on day 2 when arrival was day 1", () => {
    const plan = {
      destinationName: "Panama",
      days: [
        day({
          day: 1,
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Prihod na mednarodno letališče Tocumen (PTY)",
                type: "TRANSPORT",
                description: "Pristanek in prevzem prtljage.",
              },
            ],
            evening: [],
          },
        }),
        day({
          day: 2,
          activities: {
            morning: [
              {
                name: "Casco Viejo",
                type: "SIGHT",
                description: "Staro mestno jedro.",
              },
            ],
            afternoon: [
              {
                name: "Prihod na mednarodno letališče Tocumen (PTY)",
                type: "TRANSPORT",
                description: "Ponovni prihod in transfer do centra.",
              },
            ],
            evening: [
              {
                name: "Prevoz do hotela (taxi)",
                type: "TRANSPORT",
                description: "Transfer z letališča do hotela v centru.",
              },
            ],
          },
        }),
        // Extra day so day 2 is mid-trip (last day keeps real departure logistics).
        day({ day: 3, city: "Panama City" }),
      ],
    } as AiTripPlan;

    expect(stripPhantomArrivals(plan, 1)).toBe(2);
    expect(plan.days[0]!.activities!.afternoon).toHaveLength(1);
    expect(plan.days[1]!.activities!.afternoon).toHaveLength(0);
    expect(plan.days[1]!.activities!.evening).toHaveLength(0);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Casco/i);
  });
});

describe("dropDuplicatePoisAcrossPlan", () => {
  it("keeps the first visit and drops the later repeat, without emptying the day", () => {
    const plan = {
      destinationName: "Japan",
      contentLanguage: "sl",
      days: [
        day({
          day: 1,
          city: "Kyoto",
          activities: {
            morning: [
              {
                name: "Bambusov gozd Arashiyama in tempelj Tenryu-ji",
                type: "SIGHT",
                description: "Prvi obisk.",
              },
            ],
            afternoon: [{ name: "Zlati paviljon Kinkaku-ji", type: "SIGHT", description: "Paviljon." }],
            evening: [],
          },
        }),
        day({
          day: 2,
          city: "Kyoto",
          activities: {
            morning: [
              {
                name: "Bambusov gaj Arashiyama in tempelj Tenryu-ji",
                type: "SIGHT",
                description: "Ponovitev.",
              },
            ],
            afternoon: [
              { name: "Kosilo: Arashiyama Yoshimura", type: "EAT", description: "Soba." },
            ],
            evening: [{ name: "Raziskovanje Giona", type: "SIGHT", description: "Gejše." }],
          },
        }),
      ],
    } as AiTripPlan;

    expect(dropDuplicatePoisAcrossPlan(plan)).toBe(1);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Arashiyama/i);
    expect(plan.days[1]!.activities!.morning).toEqual([]);
    expect(plan.days[1]!.activities!.afternoon[0]!.name).toMatch(/Yoshimura/i);
    expect(plan.days[1]!.activities!.evening[0]!.name).toMatch(/Gion/i);
  });

  it("does not empty a day that only has the repeated POI", () => {
    const plan = {
      destinationName: "Japan",
      contentLanguage: "sl",
      days: [
        day({
          day: 1,
          city: "Tokyo",
          activities: {
            morning: [{ name: "Svetišče Meiji Jingu", type: "SIGHT", description: "Prvi." }],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 2,
          city: "Tokyo",
          activities: {
            morning: [{ name: "Svetišče Meiji Jingu", type: "SIGHT", description: "Samo to." }],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;

    expect(dropDuplicatePoisAcrossPlan(plan)).toBe(0);
    expect(plan.days[1]!.activities!.morning).toHaveLength(1);
  });

  it("does not treat two different Tokyo sights as the same POI", () => {
    const plan = {
      destinationName: "Japan",
      contentLanguage: "sl",
      days: [
        day({
          day: 1,
          city: "Tokyo",
          activities: {
            morning: [{ name: "Tokyo Skytree", type: "SIGHT", description: "Razgled." }],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 2,
          city: "Tokyo",
          activities: {
            morning: [{ name: "Senso-ji", type: "SIGHT", description: "Tempelj." }],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;

    expect(dropDuplicatePoisAcrossPlan(plan)).toBe(0);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Senso/i);
  });

  it("drops a later Meiji visit when the shrine was already part of an earlier day", () => {
    const plan = {
      destinationName: "Japan",
      contentLanguage: "sl",
      days: [
        day({
          day: 3,
          city: "Tokyo",
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Harajuku: Takeshita Street in svetišče Meiji Jingu",
                type: "SIGHT",
                description: "Prvi obisk.",
              },
            ],
            evening: [],
          },
        }),
        day({
          day: 15,
          city: "Tokyo",
          activities: {
            morning: [],
            afternoon: [{ name: "Svetišče Meiji Jingu", type: "SIGHT", description: "Spet." }],
            evening: [{ name: "Shibuya Crossing", type: "SIGHT", description: "Križišče." }],
          },
        }),
      ],
    } as AiTripPlan;

    expect(dropDuplicatePoisAcrossPlan(plan)).toBe(1);
    expect(plan.days[1]!.activities!.afternoon).toEqual([]);
    expect(plan.days[1]!.activities!.evening[0]!.name).toMatch(/Shibuya/i);
  });

  it("drops a later mangrove kayak when the first visit used a different inflection", () => {
    const plan = {
      destinationName: "Mexico",
      contentLanguage: "sl",
      days: [
        day({
          day: 12,
          city: "Isla Holbox",
          activities: {
            morning: [
              {
                name: "Kajakiranje skozi mangrove",
                type: "ACTIVITY",
                description: "Prvi izhod.",
              },
            ],
            afternoon: [{ name: "Plaža Punta Cocos", type: "SIGHT", description: "Zahod." }],
            evening: [],
          },
        }),
        day({
          day: 13,
          city: "Isla Holbox",
          activities: {
            morning: [
              {
                name: "Vožnja s kajakom skozi mangrove",
                type: "ACTIVITY",
                description: "Ista stvar.",
              },
            ],
            afternoon: [{ name: "Yalahau laguna", type: "SIGHT", description: "Izvir." }],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;

    expect(dropDuplicatePoisAcrossPlan(plan)).toBe(1);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Kajakiranje/i);
    expect(plan.days[1]!.activities!.morning).toEqual([]);
    expect(plan.days[1]!.activities!.afternoon[0]!.name).toMatch(/Yalahau/i);
  });
});

describe("dedupeNearIdenticalConsecutiveDays", () => {
  it("replaces a copy-pasted consecutive day", () => {
    const cloneActs = {
      morning: [
        {
          name: "Raziskovanje Casco Vieja (staro mestno jedro)",
          type: "SIGHT",
          description: "Sprehod po Casco Viejo.",
        },
      ],
      afternoon: [
        {
          name: "Obisk Panamskega prekopa – Miraflores Locks",
          type: "SIGHT",
          description: "Ogled zapornic.",
        },
      ],
      evening: [
        {
          name: "Večerja in nočno življenje v Casco Viejo",
          type: "EAT",
          description: "Večerja v Casco.",
        },
      ],
    };
    const plan = {
      destinationName: "Panama",
      contentLanguage: "sl",
      days: [
        day({ day: 3, city: "Panama City", activities: structuredClone(cloneActs) }),
        day({ day: 4, city: "Panama City", activities: structuredClone(cloneActs) }),
      ],
    } as AiTripPlan;

    expect(dedupeNearIdenticalConsecutiveDays(plan)).toBe(1);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Casco/i);
    expect(plan.days[1]!.title).toMatch(/prosti|lokalni/i);
    expect(plan.days[1]!.activities!.morning ?? []).toHaveLength(0);
    expect(plan.days[1]!.activities!.afternoon?.[0]?.name).not.toMatch(/Casco Vieja/i);
  });
});

describe("applyItineraryGuards", () => {
  it("applies all four Panama failure classes in one pass", () => {
    const cloneActs = {
      morning: [
        {
          name: "Raziskovanje Casco Vieja",
          type: "SIGHT",
          description: "Casco.",
        },
      ],
      afternoon: [
        {
          name: "Obisk Panamskega prekopa",
          type: "SIGHT",
          description: "Prekop.",
        },
      ],
      evening: [
        {
          name: "Večerja v Casco Viejo",
          type: "EAT",
          description: "Večerja.",
        },
      ],
    };
    const plan = {
      destinationName: "Panama",
      contentLanguage: "sl",
      days: [
        day({
          day: 1,
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Prihod na mednarodno letališče Tocumen (PTY)",
                type: "TRANSPORT",
                description: "Pristanek.",
              },
            ],
            evening: [],
          },
        }),
        day({
          day: 2,
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Prihod na mednarodno letališče Tocumen (PTY)",
                type: "TRANSPORT",
                description: "Ponovni prihod.",
              },
            ],
            evening: [],
          },
        }),
        day({ day: 3, activities: structuredClone(cloneActs) }),
        day({ day: 4, activities: structuredClone(cloneActs) }),
        day({
          day: 7,
          activities: {
            morning: [
              {
                name: "Jutranji ogled / sprehod",
                description:
                  "Glavni dopoldanski ogled — mesto ali znamenitost, ki jo je najbolje obiskati zjutraj.",
              },
            ],
            afternoon: [
              {
                name: "Celodnevni izlet v vas Emberá",
                type: "ACTIVITY",
                description: "Izlet.",
              },
            ],
            evening: [
              { name: "Večerja: Casa Viejo", type: "EAT", description: "A" },
              { name: "Večerja: Mercado de Mariscos", type: "EAT", description: "B" },
              { name: "Lokalna večerja", type: "EAT", description: "C" },
            ],
          },
        }),
      ],
    } as AiTripPlan;

    const stats = applyItineraryGuards(plan, { arrivalDay: 1, language: "sl" });
    expect(stats.placeholders).toBeGreaterThanOrEqual(1);
    expect(stats.genericMeals).toBeGreaterThanOrEqual(1);
    expect(stats.meals).toBeGreaterThanOrEqual(1);
    expect(stats.arrivals).toBeGreaterThanOrEqual(1);
    expect(stats.clones).toBeGreaterThanOrEqual(1);
    expect(plan.days[1]!.activities!.afternoon).toHaveLength(0);
    expect(plan.days[4]!.activities!.evening).toHaveLength(1);
  });
});

describe("relocateClosedEveningSights", () => {
  it("moves Tirana Bunk'Art off the evening slot", () => {
    const plan = {
      destinationName: "Albania",
      contentLanguage: "sl",
      days: [
        day({
          day: 8,
          city: "Tirana",
          activities: {
            morning: [],
            afternoon: [{ name: "Sprehod po Blloku", type: "SIGHT", description: "Kava." }],
            evening: [{ name: "Bunk'Art 2", type: "SIGHT", description: "Muzej." }],
          },
        }),
      ],
    } as AiTripPlan;
    expect(relocateClosedEveningSights(plan)).toBe(1);
    expect(plan.days[0]!.activities!.evening).toHaveLength(0);
    expect(plan.days[0]!.activities!.afternoon.map((a) => a.name)).toContain("Bunk'Art 2");
  });
});

describe("scrubUnsafeEarlyAirportTips", () => {
  it("removes first-RER advice for a 06:00 international departure", () => {
    const plan = {
      destinationName: "France",
      contentLanguage: "en",
      days: [
        day({
          day: 8,
          city: "Paris",
          transportationTips:
            "For an early morning flight from CDG, consider pre-booking a taxi or an Uber/Bolt the night before. Alternatively, if staying in central Paris, the RER B train starts running around 04:50 AM, but ensure it aligns with your check-in time.",
          activities: {
            morning: [
              {
                name: "International return flight",
                type: "TRANSPORT",
                description: "Depart 06:00.",
                arrivalTime: "06:00",
                departureTime: "07:25",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;

    expect(scrubUnsafeEarlyAirportTips(plan)).toBe(1);
    expect(plan.days[0]!.transportationTips).toMatch(/taxi|Uber/i);
    expect(plan.days[0]!.transportationTips).not.toMatch(/RER|04:50/i);
  });
});

describe("alignTransportationDurationWithTips", () => {
  it("lifts understated TGV banner duration to match tip hours", () => {
    const plan = {
      destinationName: "France",
      days: [
        day({
          day: 3,
          city: "Lyon",
          transportationTips:
            "The TGV train is the fastest way to travel from Paris to Lyon (approx. 2 hours).",
          transportation: [
            {
              type: "train",
              from: "Paris Gare de Lyon",
              to: "Lyon Part-Dieu",
              duration: "1h",
              estimatedPrice: 70,
            },
          ],
        }),
      ],
    } as AiTripPlan;

    expect(alignTransportationDurationWithTips(plan)).toBe(1);
    expect(plan.days[0]!.transportation![0]!.duration).toBe("2h");
  });
});

describe("FRA→EZE failure classes", () => {
  it("strips Buenos Aires generic DE meals and Viertel spam", () => {
    expect(isGenericMealActivity({ name: "Mittagessen in San Telmo:", type: "EAT" })).toBe(true);
    expect(isGenericMealActivity({ name: "Abendessen in Puerto Madero", type: "EAT" })).toBe(true);
    expect(
      isGenericMealActivity({
        name: "Abendessen in einem modernen Restaurant in Palermo",
        type: "EAT",
      }),
    ).toBe(true);
    expect(isGenericMealActivity({ name: "Abendessen im Viertel", type: "EAT" })).toBe(true);
    expect(isGenericMealActivity({ name: "Tango Show mit Abendessen", type: "ACTIVITY" })).toBe(
      false,
    );
  });

  it("repairs ca. – logistics and strips Viertel filler", () => {
    const plan = {
      destinationName: "Buenos Aires",
      days: [
        day({
          day: 2,
          activities: {
            morning: [
              {
                name: "Transfer",
                type: "TRANSPORT",
                description: "Vom Flughafen zum Hotel mit Uber / taxi (ca. – €15–35).",
              },
            ],
            afternoon: [
              {
                name: "Puerto Madero",
                type: "SIGHT",
                description:
                  "Spaziergang. Abendessen im Viertel: Abendessen abseits der Haupttouristenstraßen — bessere Preise.",
              },
            ],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(repairIncompleteLogisticsCopy(plan)).toBeGreaterThanOrEqual(1);
    expect(plan.days[0]!.activities!.morning[0]!.description).toMatch(/ca\. €15/);
    expect(plan.days[0]!.activities!.morning[0]!.description).not.toMatch(/ca\.\s*[–—-]\s*€/);
    expect(plan.days[0]!.activities!.afternoon[0]!.description).not.toMatch(/Abendessen im Viertel/i);
  });

  it("drops FLIGHT legs that are walks or cemeteries", () => {
    const plan = {
      destinationName: "Buenos Aires",
      days: [
        day({
          day: 2,
          transportation: [
            {
              type: "flight",
              from: "Ankunft am Flughafen Ezeiza (EZE)",
              to: "Buenos Aires",
              duration: "1h",
              estimatedPrice: 0,
            },
            {
              type: "flight",
              from: "Spaziergang durch Recoleta",
              to: "Buenos Aires",
              duration: "1h",
              estimatedPrice: 0,
            },
            {
              type: "flight",
              from: "Friedhof Recoleta",
              to: "Buenos Aires",
              duration: "1h",
              estimatedPrice: 10,
            },
          ],
        }),
      ],
    } as AiTripPlan;
    expect(sanitizeTransportationLegs(plan)).toBeGreaterThanOrEqual(2);
    expect(plan.days[0]!.transportation).toHaveLength(1);
    expect(plan.days[0]!.transportation![0]!.from).toMatch(/Ezeiza/i);
    expect(plan.days[0]!.transportation![0]!.type).toBe("taxi");
  });

  it("keeps one Internationaler Rückflug on the last day", () => {
    const plan = {
      destinationName: "Buenos Aires",
      days: [
        day({ day: 14, city: "Buenos Aires" }),
        day({
          day: 15,
          city: "Buenos Aires",
          activities: {
            morning: [
              {
                name: "Letzter Spaziergang oder Museumsbesuch",
                type: "ACTIVITY",
                description: "Vormittagsspaziergang.",
                arrivalTime: "22:30",
                departureTime: "07:20",
              },
              {
                name: "Internationaler Rückflug",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Abflug, Ankunft.",
                arrivalTime: "22:30",
                departureTime: "07:20",
              },
            ],
            afternoon: [
              {
                name: "Internationaler Rückflug",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Abflug, Ankunft.",
              },
            ],
            evening: [
              {
                name: "Hotel Check-out",
                type: "TRANSPORT",
                description: "Morgens auschecken.",
              },
              {
                name: "Internationaler Rückflug",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Abflug 22:30, Ankunft 07:20.",
                arrivalTime: "22:30",
                departureTime: "07:20",
              },
            ],
          },
        }),
      ],
    } as AiTripPlan;
    expect(dedupeLastDayReturnFlights(plan)).toBe(2);
    const acts = plan.days[1]!.activities!;
    const returns = ["morning", "afternoon", "evening"].flatMap((s) =>
      (acts[s as "morning"] ?? []).filter((a) => /Rückflug/i.test(a.name ?? "")),
    );
    expect(returns).toHaveLength(1);
    expect(returns[0]!.description).toMatch(/22:30/);
  });

  it("repairs DE dangling sentence ends without ellipsis", () => {
    expect(
      repairTruncatedCopy(
        "Spazieren Sie entlang der Hafenpromenade und genießen Sie die maritime.",
      ),
    ).toMatch(/Hafenpromenade/i);
    expect(
      repairTruncatedCopy(
        "Spazieren Sie entlang der Hafenpromenade und genießen Sie die maritime.",
      ),
    ).not.toMatch(/maritime/i);
    expect(repairTruncatedCopy("um die Reise ausklingen zu.")).toBe("");
    expect(
      repairTruncatedCopy(
        "Nutzen Sie den Vormittag für einen Museumsbesuch, das Ihnen besonders.",
      ),
    ).not.toMatch(/besonders/i);
  });
});
