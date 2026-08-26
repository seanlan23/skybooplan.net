import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  alignTransportationDurationWithTips,
  applyItineraryGuards,
  stripPrematureDestinationProgram,
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
  dropGenericSightStubs,
  ensureCompleteDaySlots,
  stripRevisitLeadIns,
  ensureCityChangeTransfer,
  stripReplayedIntercityHops,
  stripImplausibleLongHaulProgram,
  isHollowProgramTitle,
} from "@/lib/itineraryGuards";
import { repairTruncatedCopy } from "@/lib/textSanitize";
import { expandPlanDaysToExpected } from "@/lib/daySequence";

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

  it("flags thin-day local sight placeholders from the Thailand PDF", () => {
    expect(
      isEnricherPlaceholderActivity({
        name: "Lokalni pomembnejši ogled v Phuket",
        description: "En konkreten ogled (muzej, trg ali park) — drugačen od prejšnjega dne.",
      }),
    ).toBe(true);
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

  it("strips Railay title and Ao Nang dinner from a Koh Lipe day", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({
          day: 12,
          city: "Koh Lipe",
          title: "Rajske plaže Railaya in Phra Nang",
          focusName: "Ao Nang",
          activities: {
            morning: [
              {
                name: "Sunrise Beach",
                type: "SIGHT",
                description: "Jutranji sprehod po Lipeju.",
              },
            ],
            afternoon: [
              {
                name: "Celodnevni izlet na otoke Phi",
                type: "SIGHT",
                description: "Phi Phi z Lipeja.",
              },
            ],
            evening: [
              {
                name: "Večerja v Ao Nangu: The Hilltop",
                type: "EAT",
                description: "The Hilltop nad Ao Nangom.",
              },
            ],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripWrongCityDayActivities(plan)).toBeGreaterThanOrEqual(3);
    expect(plan.days[0]!.title).toMatch(/Koh Lipe/i);
    expect(plan.days[0]!.focusName).toMatch(/Koh Lipe/i);
    const blob = JSON.stringify(plan.days[0]!.activities);
    expect(blob).not.toMatch(/Railay|Phi Phi|Ao Nang|Hilltop/i);
    expect(blob).toMatch(/Sunrise Beach/i);
  });

  it("clears Chiang Mai transport tips that leaked onto a Phuket day", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({
          day: 9,
          city: "Phuket",
          transportationTips:
            "Grab ali songthaew do Doi Suthepa. Letališče CNX je 15 min od središča.",
          activities: {
            morning: [
              { name: "Patong Beach", type: "SIGHT", description: "Jutro na Patongu." },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripWrongCityDayActivities(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.transportationTips).toBe("");
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Patong/i);
  });

  it("drops Jim Thompson and Yaowarat from a Koh Samui day but keeps Wat Phra Yai", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({
          day: 14,
          city: "Koh Samui",
          transportationTips: "Vožnja z BTS Skytrainom po Bangkoku in MRT do Yaowarata.",
          activities: {
            morning: [
              { name: "Wat Phra Yai", type: "SIGHT", description: "Veliki Buda na Samuju." },
            ],
            afternoon: [
              {
                name: "Hiša Jima Thompsona",
                type: "SIGHT",
                description: "Muzej svile v Bangkoku.",
              },
            ],
            evening: [
              { name: "Večerja v Yaowarat", type: "EAT", description: "Kitajska četrt." },
            ],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripWrongCityDayActivities(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.transportationTips).toBe("");
    const names = [
      ...(plan.days[0]!.activities!.morning ?? []),
      ...(plan.days[0]!.activities!.afternoon ?? []),
      ...(plan.days[0]!.activities!.evening ?? []),
    ].map((a) => a.name);
    expect(names).toEqual(["Wat Phra Yai"]);
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

  it("labels a 1 300 km city change as a domestic flight, not a taxi prevoz", () => {
    const plan = {
      destinationName: "Mexico",
      contentLanguage: "sl" as const,
      days: [
        day({ day: 4, city: "Mexico City" }),
        day({ day: 5, city: "Cancun", title: "Potovanje v Cancún" }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBe(1);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Notranji let Mexico City → Cancun/);
    expect(plan.days[1]!.activities!.morning[0]!.transportType).toBe("flight");
    expect(plan.days[1]!.morning).not.toMatch(/^Prevoz Mexico City/);
  });

  it("upgrades a sea hop labeled Prevoz to a domestic flight", () => {
    const plan = {
      destinationName: "Indonesia",
      contentLanguage: "sl" as const,
      days: [
        day({ day: 7, city: "Seminyak" }),
        day({
          day: 8,
          city: "Labuan Bajo",
          activities: {
            morning: [
              {
                name: "Seminyak → Labuan Bajo",
                type: "TRANSPORT",
                description: "Prevoz Seminyak → Labuan Bajo.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBeGreaterThan(0);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Notranji let/i);
    expect(plan.days[1]!.activities!.morning[0]!.transportType).toBe("flight");
    expect(plan.days[1]!.activities!.morning[0]!.description).toMatch(/DPS|LBJ|let/i);
    expect(plan.days[1]!.activities!.morning[0]!.description).not.toMatch(/^Prevoz Seminyak/);
  });

  it("does not replay yesterday's domestic flight on the arrival-city day", () => {
    const plan = {
      destinationName: "Mexico",
      contentLanguage: "sl" as const,
      days: [
        day({
          day: 5,
          city: "Mexico City",
          activities: {
            morning: [
              {
                name: "Notranji let iz Mexico Cityja (MEX) v Cancún (CUN)",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Zjutraj se odpravite na letališče.",
              },
            ],
            afternoon: [
              {
                name: "Prihod v Cancún in namestitev v hotel",
                type: "STAY",
                description: "Po pristanku do hotela.",
              },
            ],
            evening: [],
          },
        }),
        day({
          day: 6,
          city: "Cancun",
          activities: {
            morning: [
              {
                name: "Notranji let Mexico City → Cancun",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Notranji let Mexico City → Cancun.",
              },
              {
                name: "Sprostitev na Playa Delfines",
                type: "SIGHT",
                description: "Javna plaža.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBe(0);
    expect(JSON.stringify(plan.days[1]!.activities)).not.toMatch(/Notranji let/i);
    expect(plan.days[1]!.activities!.morning.map((a) => a.name)).toEqual([
      "Sprostitev na Playa Delfines",
    ]);
  });

  it("strips a replayed inbound flight on the second day of the same city", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl" as const,
      days: [
        day({
          day: 11,
          city: "Chiang Mai",
          lat: 18.79,
          lng: 98.99,
          activities: {
            morning: [
              {
                name: "Notranji let Phuket → Chiang Mai",
                type: "TRANSPORT",
                transportType: "flight",
                description: "HKT → CNX",
              },
            ],
            afternoon: [{ name: "Pavza v Nimman", type: "SIGHT", description: "Nimman." }],
            evening: [],
          },
        }),
        day({
          day: 12,
          city: "Chiang Mai",
          lat: 18.79,
          lng: 98.99,
          activities: {
            morning: [
              {
                name: "Notranji let Phuket (HKT) → Chiang Mai (CNX)",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Notranji let Phuket (HKT) → Chiang Mai (CNX)",
              },
            ],
            afternoon: [{ name: "Pavza v Nimman", type: "SIGHT", description: "Galerije." }],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripReplayedIntercityHops(plan)).toBeGreaterThan(0);
    expect(JSON.stringify(plan.days[1]!.activities)).not.toMatch(/Notranji let|HKT/i);
    expect(plan.days[1]!.activities!.afternoon.map((a) => a.name)).toEqual(["Pavza v Nimman"]);
  });

  it("keeps an outbound flight on the last night of a stay", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl" as const,
      days: [
        day({
          day: 10,
          city: "Phuket",
          lat: 7.88,
          lng: 98.4,
          activities: { morning: [], afternoon: [], evening: [] },
        }),
        day({
          day: 11,
          city: "Phuket",
          lat: 7.88,
          lng: 98.4,
          activities: {
            morning: [
              {
                name: "Notranji let Phuket → Chiang Mai",
                type: "TRANSPORT",
                transportType: "flight",
                description: "HKT → CNX",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripReplayedIntercityHops(plan)).toBe(0);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Phuket → Chiang Mai/);
  });

  it("strips 'let iz Krabija v Bangkok' on the second Bangkok day", () => {
    const plan = {
      destinationName: "Thailand",
      originIata: "LJU",
      contentLanguage: "sl" as const,
      days: [
        day({
          day: 13,
          city: "Bangkok",
          lat: 13.75,
          lng: 100.5,
          transportation: [
            { type: "ferry", from: "Koh Phi Phi", to: "Krabi", duration: "1h 30m", estimatedPrice: 15 },
            { type: "flight", from: "Krabi", to: "Bangkok", duration: "1h 20m", estimatedPrice: 60 },
          ],
          activities: {
            morning: [
              {
                name: "Vožnja s trajektom s Koh Phi Phi v Krabi",
                type: "TRANSPORT",
                transportType: "ferry",
                description: "Trajekt na celino.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 14,
          city: "Bangkok",
          lat: 13.75,
          lng: 100.5,
          activities: {
            morning: [
              {
                name: "Notranji let iz Krabija v Bangkok",
                type: "SIGHT",
                description:
                  "Jutranji let iz Krabija (KBV) na letališče Suvarnabhumi (BKK) v Bangkoku.",
              },
            ],
            afternoon: [
              { name: "Wat Arun", type: "SIGHT", description: "Tempelj zore ob reki Chao Phraya." },
            ],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripReplayedIntercityHops(plan)).toBeGreaterThan(0);
    expect(JSON.stringify(plan.days[1]!.activities!.morning)).not.toMatch(/Krabija|KBV/i);
    expect(plan.days[1]!.activities!.afternoon.map((a) => a.name)).toEqual(["Wat Arun"]);
  });

  it("drops hollow Morning in / Visit titles", () => {
    expect(isHollowProgramTitle("Morning in Krabi")).toBe(true);
    expect(isHollowProgramTitle("Visit Railay Beach")).toBe(true);
    expect(isHollowProgramTitle("Snorkeling Trip")).toBe(true);
    expect(isHollowProgramTitle("Dan 3")).toBe(true);
    expect(isHollowProgramTitle("Gili Trawangan →.")).toBe(true);
    expect(
      isHollowProgramTitle(
        "Wat Pho (Tempelj ležečega Bude)",
        "Sprehodite se do Wat Pho, templja z ležečim Budo.",
      ),
    ).toBe(false);
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl",
      days: [
        day({
          day: 9,
          city: "Krabi",
          activities: {
            morning: [{ name: "Visit Railay Beach", type: "SIGHT" }],
            afternoon: [{ name: "City Exploration", type: "SIGHT" }],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripPlaceholderActivities(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.activities!.morning).toEqual([]);
    expect(plan.days[0]!.activities!.afternoon).toEqual([]);
  });

  it("strips Bangkok afternoon sights after a 06:40 Europe departure", () => {
    const plan = {
      destinationName: "Thailand",
      originIata: "LJU",
      destinationIata: "BKK",
      contentLanguage: "sl",
      days: [
        day({
          day: 1,
          city: "Bangkok",
          lat: 13.75,
          lng: 100.5,
          activities: {
            morning: [
              {
                name: "Mednarodni let (LJU) 06:40",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Odhod 06:40 z LJU.",
                departureTime: "06:40",
              },
              {
                name: "Prevoz do hotela (Grab / taxi) 08:55",
                type: "TRANSPORT",
                description: "Iz BKK do hotela.",
                arrivalTime: "08:55",
              },
            ],
            afternoon: [
              {
                name: "Večerna rečna vožnja po Chao Phraya",
                type: "SIGHT",
                description: "Ladja mimo templjev.",
              },
            ],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripImplausibleLongHaulProgram(plan)).toBeGreaterThan(0);
    expect(JSON.stringify(plan.days[0]!.activities)).toMatch(/LJU|06:40/);
    expect(JSON.stringify(plan.days[0]!.activities)).not.toMatch(/Chao Phraya|08:55/);
  });

  it("does not treat the reverse hop as already flown", () => {
    const plan = {
      destinationName: "Canada",
      contentLanguage: "en" as const,
      days: [
        day({ day: 1, city: "Toronto", title: "Toronto" }),
        day({
          day: 2,
          city: "Vancouver",
          title: "Vancouver",
          activities: {
            morning: [
              {
                name: "Domestic flight Toronto → Vancouver",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Domestic flight Toronto → Vancouver.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 3,
          city: "Toronto",
          title: "Domestic flight to Toronto and international departure",
          activities: {
            morning: [
              {
                name: "Domestic flight Vancouver → Toronto",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Morning domestic air Vancouver → Toronto.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBe(0);
    expect(plan.days[2]!.activities!.morning[0]!.name).toMatch(
      /Domestic flight Vancouver\s*→\s*Toronto/i,
    );
  });

  it("does not invent a second Munich→Bangkok hop after an in-flight day", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl" as const,
      originIata: "MUC",
      destinationIata: "BKK",
      days: [
        day({
          day: 1,
          city: "Munich",
          inFlightDay: true,
          title: "Mednarodni let Munich → Bangkok",
        }),
        day({
          day: 2,
          city: "Bangkok",
          activities: {
            morning: [
              {
                name: "Notranji let Munich → Bangkok",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Notranji let Munich → Bangkok. Prihod v Don Mueang.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBe(0);
    expect(JSON.stringify(plan.days[1]!.activities)).not.toMatch(/Notranji let/i);
    expect(JSON.stringify(plan.days[1]!.activities)).not.toMatch(/Munich/i);
  });

  it("labels Munich→Bangkok as an international flight, not a domestic hop", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl" as const,
      originIata: "MUC",
      destinationIata: "BKK",
      days: [
        day({ day: 1, city: "Munich", title: "München" }),
        day({ day: 2, city: "Bangkok", title: "Prihod v Bangkok" }),
      ],
    } as AiTripPlan;
    expect(ensureCityChangeTransfer(plan)).toBe(1);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(
      /Mednarodni let Munich → Bangkok/,
    );
    expect(plan.days[1]!.activities!.morning[0]!.name).not.toMatch(/Notranji let/);
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

  it("drops a later Mercado 28 visit after the first market day", () => {
    const plan = {
      destinationName: "Mexico",
      days: [
        day({
          day: 2,
          city: "Cancun",
          activities: {
            morning: [],
            afternoon: [
              { name: "Mercado 28 – Lokalna tržnica", type: "SIGHT", description: "Spominki." },
            ],
            evening: [],
          },
        }),
        day({
          day: 5,
          city: "Cancun",
          activities: {
            morning: [{ name: "Plaža", type: "ACTIVITY", description: "Bazen." }],
            afternoon: [
              {
                name: "Odkrivanje Mercado 28 (tržnice)",
                type: "SIGHT",
                description: "Spet tržnica.",
              },
            ],
            evening: [{ name: "Taqueria Coapeñitos", type: "EAT", description: "Tacos." }],
          },
        }),
      ],
    } as AiTripPlan;
    expect(dropDuplicatePoisAcrossPlan(plan)).toBe(1);
    expect(plan.days[1]!.activities!.afternoon).toEqual([]);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Plaža/);
  });

  it("drops a later Playa Delfines visit after the first beach morning", () => {
    const plan = {
      destinationName: "Mexico",
      days: [
        day({
          day: 2,
          city: "Cancun",
          activities: {
            morning: [
              { name: "Playa Delfines (El Mirador)", type: "SIGHT", description: "Prva." },
            ],
            afternoon: [{ name: "Navios", type: "EAT", description: "Kosilo." }],
            evening: [],
          },
        }),
        day({
          day: 14,
          city: "Cancun",
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Sproščanje na plaži Delfines (Playa Delfines)",
                type: "SIGHT",
                description: "Spet ista plaža.",
              },
            ],
            evening: [{ name: "Coco Bongo", type: "ACTIVITY", description: "Noč." }],
          },
        }),
      ],
    } as AiTripPlan;
    expect(dropDuplicatePoisAcrossPlan(plan)).toBe(1);
    expect(plan.days[1]!.activities!.afternoon).toEqual([]);
    expect(plan.days[1]!.activities!.evening[0]!.name).toMatch(/Coco/);
  });

  it("drops a generic Playa stub so the named beach can stay once", () => {
    const plan = {
      destinationName: "Mexico",
      days: [
        day({
          day: 8,
          city: "Tulum",
          activities: {
            morning: [{ name: "Sprostitev na Playa", type: "SIGHT", description: "Sprostitev na Playa" }],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 9,
          city: "Tulum",
          activities: {
            morning: [],
            afternoon: [
              { name: "Sprostitev na Playa Paraíso", type: "SIGHT", description: "Turkizno morje." },
            ],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(dropGenericSightStubs(plan)).toBe(1);
    expect(plan.days[0]!.activities!.morning).toEqual([]);
    expect(dropDuplicatePoisAcrossPlan(plan)).toBe(0);
    expect(plan.days[1]!.activities!.afternoon[0]!.name).toMatch(/Paraíso|Paraiso/i);
  });

  it("strips 'after the ruins' lead-in when the ruins were already a day", () => {
    const plan = {
      destinationName: "Mexico",
      days: [
        day({
          day: 10,
          city: "Tulum",
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Koktajli na plažnem klubu",
                type: "SIGHT",
                description: "Po ogledu ruševin se sprostite v enem izmed plažnih klubov.",
              },
            ],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripRevisitLeadIns(plan)).toBe(1);
    expect(plan.days[0]!.activities!.afternoon[0]!.description).toMatch(/^Sprostite/i);
    expect(plan.days[0]!.activities!.afternoon[0]!.description).not.toMatch(/ruševin/i);
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

  it("keeps Chichén Itzá on the nearest overnight (Valladolid), not Cancun", () => {
    const plan = {
      destinationName: "Mexico",
      destinationIata: "CUN",
      contentLanguage: "sl",
      days: [
        day({
          day: 2,
          city: "Cancun",
          lat: 21.161,
          lng: -86.851,
          activities: {
            morning: [
              {
                name: "Chichén Itzá",
                type: "SIGHT",
                description: "Dan izleta iz Cancuna do piramid.",
              },
            ],
            afternoon: [{ name: "Mercado 28", type: "SIGHT", description: "Tržnica v Cancunu." }],
            evening: [{ name: "Playa Delfines", type: "BEACH", description: "Večer na plaži." }],
          },
        }),
        day({
          day: 6,
          city: "Valladolid",
          lat: 20.69,
          lng: -88.201,
          activities: {
            morning: [
              {
                name: "Ruševine Chichen Itza",
                type: "SIGHT",
                description: "Ogled piramid iz Valladolida, najbližje baze.",
              },
            ],
            afternoon: [{ name: "Cenote Zaci", type: "SIGHT", description: "Cenote v mestu." }],
            evening: [{ name: "Calzada de los Frailes", type: "SIGHT", description: "Sprehod." }],
          },
        }),
      ],
    } as AiTripPlan;

    expect(dropDuplicatePoisAcrossPlan(plan)).toBe(1);
    expect(plan.days[0]!.activities!.morning).toEqual([]);
    expect(plan.days[1]!.activities!.morning[0]!.name).toMatch(/Chichen/i);
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
    expect(plan.days[1]!.activities!.afternoon ?? []).toHaveLength(0);
    expect(plan.days[1]!.activities!.evening ?? []).toHaveLength(0);
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

  it("does not steal Krabi nights onto Koh Lipe", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl",
      days: [
        day({ day: 8, city: "Krabi", lat: 8.05, lng: 98.92, title: "Krabi" }),
        day({ day: 9, city: "Koh Lipe", lat: 6.49, lng: 99.3, title: "Koh Lipe" }),
        day({ day: 10, city: "Koh Lipe", lat: 6.49, lng: 99.3, title: "Koh Lipe" }),
        day({ day: 11, city: "Koh Lipe", lat: 6.49, lng: 99.3, title: "Koh Lipe" }),
        day({ day: 12, city: "Koh Lipe", lat: 6.49, lng: 99.3, title: "Koh Lipe" }),
        day({ day: 13, city: "Koh Lipe", lat: 6.49, lng: 99.3, title: "Koh Lipe" }),
        day({ day: 14, city: "Koh Lipe", lat: 6.49, lng: 99.3, title: "Koh Lipe" }),
        day({ day: 15, city: "Koh Lipe", lat: 6.49, lng: 99.3, title: "Koh Lipe" }),
        day({ day: 16, city: "Bangkok", lat: 13.75, lng: 100.5, title: "Bangkok" }),
      ],
    } as AiTripPlan;
    applyItineraryGuards(plan, { language: "sl" });
    expect(plan.days.filter((d) => /krabi/i.test(d.city)).map((d) => d.day)).toEqual([8]);
    expect(plan.days.filter((d) => /lipe/i.test(d.city)).map((d) => d.day)).toEqual(
      expect.arrayContaining([9, 10, 11, 12, 13, 14]),
    );
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

  it("drops destination breakfast and sights before an afternoon inbound flight", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({
          day: 10,
          city: "Krabi",
          activities: {
            morning: [
              {
                name: "Zajtrk v Ao Nang",
                type: "EAT",
                description: "Zajtrk pred izletom na Phi Phi.",
              },
              {
                name: "Celodnevni izlet na Phi Phi",
                type: "SIGHT",
                description: "Otoki pred prihodom.",
              },
            ],
            afternoon: [
              {
                name: "Let Chiang Mai → Krabi",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Domači let CNX–KBV.",
              },
            ],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripPrematureDestinationProgram(plan)).toBe(2);
    expect(plan.days[0]!.activities!.morning).toEqual([]);
    expect(plan.days[0]!.activities!.afternoon).toHaveLength(1);
  });

  it("drops island breakfast when the morning is still the inbound boat", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({
          day: 13,
          city: "Koh Lipe",
          activities: {
            morning: [
              {
                name: "Zajtrk na otoku / Počasen zajtrk v beach baru",
                type: "EAT",
                description: "Zajtrk pred plažo.",
              },
              {
                name: "Prevoz iz Krabija do Pak Bara",
                type: "TRANSPORT",
                description: "Kombi in čoln na Koh Lipe.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripPrematureDestinationProgram(plan)).toBe(1);
    const names = (plan.days[0]!.activities!.morning ?? []).map((a) => a.name).join(" ");
    expect(names).not.toMatch(/zajtrk/i);
    expect(names).toMatch(/Pak Bara/i);
  });

  it("keeps a mid-stay morning program when afternoon is only a local van", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({
          day: 8,
          city: "Chiang Mai",
          activities: {
            morning: [
              {
                name: "Wat Phra Singh",
                type: "SIGHT",
                description: "Tempelj v starem mestu.",
              },
            ],
            afternoon: [
              {
                name: "Kombi iz hotela do templja",
                type: "TRANSPORT",
                description: "Kratek lokalni prevoz.",
              },
            ],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripPrematureDestinationProgram(plan)).toBe(0);
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Wat Phra Singh/i);
  });

  it("drops Doi Suthep when the morning is still the BKK→CNX flight", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({
          day: 5,
          city: "Chiang Mai",
          activities: {
            morning: [
              {
                name: "Let Bangkok → Chiang Mai",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Domači let BKK–CNX.",
              },
              {
                name: "Doi Suthep",
                type: "SIGHT",
                description: "Tempelj ob 09:00, pred pristankom.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripPrematureDestinationProgram(plan)).toBe(1);
    const names = (plan.days[0]!.activities!.morning ?? []).map((a) => a.name).join(" ");
    expect(names).toMatch(/Bangkok → Chiang Mai/i);
    expect(names).not.toMatch(/Doi Suthep/i);
    expect(plan.days[0]!.activities!.afternoon.map((a) => a.name).join(" ")).toMatch(/Doi Suthep/i);
  });

  it("moves morning sights to afternoon on an overnight city/island hop", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({
          day: 4,
          city: "Bangkok",
          activities: {
            morning: [{ name: "Wat Arun", type: "SIGHT", description: "Tempel ob reki." }],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 5,
          city: "Chiang Mai",
          activities: {
            morning: [
              {
                name: "Wat Phra Singh",
                type: "SIGHT",
                description: "Tempel v starem mestu, po prijavi v hotel.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 6,
          city: "Chiang Mai",
          activities: {
            morning: [{ name: "Doi Suthep", type: "SIGHT", description: "Hribovski tempelj." }],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(stripPrematureDestinationProgram(plan)).toBe(1);
    expect(plan.days[1]!.activities!.morning).toEqual([]);
    expect(plan.days[1]!.activities!.afternoon.map((a) => a.name).join(" ")).toMatch(
      /Wat Phra Singh/i,
    );
    expect(plan.days[2]!.activities!.morning[0]!.name).toMatch(/Doi Suthep/i);
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

describe("ensureCompleteDaySlots", () => {
  it("does not inject generic city fillers into empty mid-trip slots", () => {
    const plan = {
      destinationName: "Mexico",
      contentLanguage: "sl",
      days: [
        day({
          day: 1,
          city: "Cancun",
          activities: {
            morning: [
              {
                name: "Mednarodni let v Cancun",
                type: "TRANSPORT",
                description: "Prihod zvečer, prvi dan brez ogledov pred pristanom.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 2,
          city: "Cancun",
          activities: {
            morning: [{ name: "Playa Delfines", type: "BEACH", description: "Jutro na plaži v Cancunu po prihodu." }],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 4,
          city: "Valladolid",
          lat: 20.69,
          lng: -88.201,
          activities: { morning: [], afternoon: [], evening: [] },
        }),
        day({
          day: 9,
          city: "Tulum",
          activities: { morning: [], afternoon: [], evening: [] },
        }),
        day({
          day: 12,
          city: "Playa del Carmen",
          activities: { morning: [], afternoon: [], evening: [] },
        }),
        day({
          day: 15,
          city: "Cancun",
          activities: {
            morning: [
              {
                name: "Mednarodni povratni let",
                type: "TRANSPORT",
                description: "Odhod z letališča CUN, brez popoldanskega programa.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    expect(ensureCompleteDaySlots(plan)).toBe(0);
    const blob = JSON.stringify(plan);
    expect(blob).not.toMatch(/Popoldanski ogled v mestu/i);
    expect(blob).not.toMatch(/Večer v soseski, kjer spiš/i);
    expect(blob).not.toMatch(/Središče in trg v mestu/i);
    for (const n of [4, 9, 12]) {
      const d = plan.days.find((x) => x.day === n)!;
      expect(d.activities!.morning).toHaveLength(0);
      expect(d.activities!.afternoon).toHaveLength(0);
      expect(d.activities!.evening).toHaveLength(0);
    }
  });

  it("strips leftover day-part filler titles if they were already injected", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl",
      days: [
        day({
          day: 5,
          city: "Bangkok",
          activities: {
            morning: [
              {
                name: "Središče in trg v mestu Bangkok",
                type: "SIGHT",
                description: "Generičen dopoldan.",
              },
            ],
            afternoon: [
              {
                name: "Popoldanski ogled v mestu Bangkok",
                type: "SIGHT",
                description: "Generičen popoldan.",
              },
            ],
            evening: [
              {
                name: "Večer v soseski, kjer spiš v mestu Bangkok",
                type: "EAT",
                description: "Generičen večer.",
              },
            ],
          },
        }),
      ],
    } as AiTripPlan;
    expect(dropGenericSightStubs(plan)).toBe(3);
    expect(plan.days[0]!.activities!.morning).toEqual([]);
    expect(plan.days[0]!.activities!.afternoon).toEqual([]);
    expect(plan.days[0]!.activities!.evening).toEqual([]);
  });

  it("turns a 3-day France stub into a full 15-day calendar without filler titles", () => {
    const plan = {
      destinationName: "Francija in Španija",
      contentLanguage: "sl",
      days: [
        day({
          day: 1,
          city: "Paris",
          activities: {
            morning: [
              {
                name: "Prihod v Pariz",
                type: "TRANSPORT",
                description: "Pristanek in prevoz do hotela v središču Pariza.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 2,
          city: "Paris",
          activities: {
            morning: [
              {
                name: "Louvre",
                type: "SIGHT",
                description: "Dopoldan v muzeju, potem sprehod ob Seni.",
              },
            ],
            afternoon: [
              { name: "Marais", type: "SIGHT", description: "Sprehod po četrti Marais." },
            ],
            evening: [],
          },
        }),
        day({
          day: 3,
          city: "Blois",
          activities: {
            morning: [
              { name: "Château de Blois", type: "SIGHT", description: "Ogled gradu v Bloisu." },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;

    expandPlanDaysToExpected(plan, {
      expectedDays: 15,
      language: "sl",
      departDate: "2026-08-01",
    });
    applyItineraryGuards(plan, { arrivalDay: 1, language: "sl" });
    expect(plan.days).toHaveLength(15);
    const blob = JSON.stringify(plan);
    expect(blob).not.toMatch(/Popoldanski ogled v mestu/i);
    expect(blob).not.toMatch(/Večer v soseski, kjer spiš/i);
    expect(blob).not.toMatch(/Središče in trg v mestu/i);
    expect(blob).not.toMatch(/Popoldanski lokalni ogled/i);
  });

  it("scrubs Thailand PDF mix-ups: wrong-city POI, stale tips, domestic label on long-haul", () => {
    const plan = {
      destinationName: "Thailand",
      contentLanguage: "sl",
      originIata: "MUC",
      destinationIata: "BKK",
      days: [
        day({ day: 1, city: "Munich", title: "Odhod" }),
        day({
          day: 2,
          city: "Bangkok",
          activities: {
            morning: [
              {
                name: "Notranji let Munich → Bangkok",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Notranji let Munich → Bangkok. Prihod v BKK.",
              },
            ],
            afternoon: [
              { name: "Wat Pho", type: "SIGHT", description: "Ležeči Buda ob reki." },
            ],
            evening: [],
          },
        }),
        day({
          day: 7,
          city: "Chiang Mai",
          title: "Kulinarične in kulturne.",
          activities: {
            morning: [
              { name: "Doi Suthep", type: "SIGHT", description: "Tempelj nad mestom." },
            ],
            afternoon: [],
            evening: [
              {
                name: "Savoey Seafood Restaurant (Patong)",
                type: "EAT",
                description: "Morski sadeži na Patongu.",
              },
            ],
          },
        }),
        day({
          day: 10,
          city: "Phuket",
          transportationTips: "Songthaew do Doi Suthepa in taksi do CNX.",
          activities: {
            morning: [
              {
                name: "Lokalni pomembnejši ogled v Phuket",
                type: "SIGHT",
                description: "En konkreten ogled (muzej, trg ali park).",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
        day({
          day: 14,
          city: "Koh Samui",
          transportationTips: "Vožnja z BTS Skytrainom po Bangkoku.",
          activities: {
            morning: [
              { name: "Wat Phra Yai", type: "SIGHT", description: "Veliki Buda na Samuju." },
            ],
            afternoon: [
              { name: "Hiša Jima Thompsona", type: "SIGHT", description: "Svila v Bangkoku." },
            ],
            evening: [],
          },
        }),
        day({
          day: 16,
          city: "Bangkok",
          activities: {
            morning: [
              {
                name: "Mednarodni povratni let Bangkok → Munich",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Povratek v MUC.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;

    applyItineraryGuards(plan, { arrivalDay: 1, language: "sl" });

    expect(JSON.stringify(plan.days[1]!.activities)).toMatch(/Mednarodni let Munich → Bangkok/);
    expect(JSON.stringify(plan.days[1]!.activities)).not.toMatch(/Notranji let Munich/);
    expect(JSON.stringify(plan.days[2]!.activities)).not.toMatch(/Savoey|Patong/i);
    expect(plan.days[2]!.title).not.toMatch(/Kulinarične in kulturne/i);
    expect(plan.days[3]!.transportationTips ?? "").not.toMatch(/Doi Suthep|CNX/i);
    expect(JSON.stringify(plan.days[3]!.activities)).not.toMatch(/Lokalni pomembnejši ogled/i);
    expect(JSON.stringify(plan.days[3]!.activities)).not.toMatch(/Popoldanski ogled v mestu/i);
    expect(JSON.stringify(plan.days[4]!.activities)).toMatch(/Wat Phra Yai/);
    expect(JSON.stringify(plan.days[4]!.activities)).not.toMatch(/Thompson|Yaowarat|BTS/i);
    expect(plan.days[4]!.transportationTips ?? "").not.toMatch(/BTS Skytrain/i);
  });
});
