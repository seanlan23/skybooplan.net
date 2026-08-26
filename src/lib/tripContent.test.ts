import { describe, expect, it } from "vitest";
import {
  cleanseRegionHighlights,
  dedupeSameDayGeoConflicts,
  ensureAyutthayaArrivalHighlights,
  filterArrivalDayHighlights,
  filterDepartureDayHighlights,
  filterInboundTravelDayHighlights,
  filterTravelOutDayHighlights,
  isAiPlaceholderText,
  isClosedDeprecatedPoi,
  isEarlyClosingPoi,
  isEveningOnlyPoi,
  isForeignPoiForRegion,
  isWrongCityPoi,
  spreadKrabiBoatExcursions,
  splitKrabiHillTempleDays,
  isHeavyRegionalTravel,
  isFullDayExcursion,
  isLongFormMarket,
  isMorningOnlyPoi,
  isNightlifeOnlyPoi,
  isSunsetOnlyPoi,
  isSunsetTemplePoi,
  resolveMarketTravelConflicts,
  fixPoiPriceLabel,
  isPoiOpenOnTripDay,
  reconcileWeekdayGatedActivities,
} from "@/lib/tripContent";
import { rewriteActivityCityLeak } from "@/lib/textSanitize";
import type { TripRegion } from "@/lib/aiPlan.functions";

const madrid: TripRegion = {
  city: "Madrid",
  startDay: 1,
  endDay: 3,
  summary: "",
  lat: 40.42,
  lng: -3.7,
  highlights: [],
};

describe("isAiPlaceholderText", () => {
  it("detects prompt scaffolding", () => {
    expect(isAiPlaceholderText("2–3 stavki: kaj vidiš, zakaj je vredno")).toBe(true);
  });

  it("detects enricher generic morning copy", () => {
    expect(
      isAiPlaceholderText(
        "Glavni dopoldanski ogled — mesto ali znamenitost, ki jo je najbolje obiskati zjutraj.",
      ),
    ).toBe(true);
  });
});

describe("isForeignPoiForRegion", () => {
  it("blocks Louvre in Madrid", () => {
    expect(isForeignPoiForRegion("Louvre Museum", madrid, "ES")).toBe(true);
  });

  it("blocks Louvre in Chicago", () => {
    expect(
      isForeignPoiForRegion("Louvre Museum", { ...madrid, city: "Chicago" }, "US"),
    ).toBe(true);
  });

  it("blocks Art Institute of Chicago in Ho Chi Minh City", () => {
    expect(
      isForeignPoiForRegion(
        "Art Institute of Chicago",
        { ...madrid, city: "Ho Chi Minh City" },
        "VN",
      ),
    ).toBe(true);
  });

  it("blocks Colosseum in Ho Chi Minh City", () => {
    expect(
      isForeignPoiForRegion("Colosseum", { ...madrid, city: "Ho Chi Minh City" }, "VN"),
    ).toBe(true);
  });

  it("blocks Statue of Liberty in Bangkok", () => {
    expect(
      isForeignPoiForRegion("Statue of Liberty", { ...madrid, city: "Bangkok" }, "TH"),
    ).toBe(true);
  });

  it("allows Hagia Sophia in Istanbul", () => {
    expect(
      isForeignPoiForRegion("Hagia Sophia", { ...madrid, city: "Istanbul" }, "TR"),
    ).toBe(false);
  });

  it("allows Maya Bay in Krabi", () => {
    expect(
      isForeignPoiForRegion("Maya Bay", { ...madrid, city: "Krabi" }, "TH", "Izlet na Phi Phi"),
    ).toBe(false);
  });

  it("blocks Lanta Old Town while staying in Krabi", () => {
    expect(
      isForeignPoiForRegion(
        "Lanta Old Town",
        { ...madrid, city: "Krabi" },
        "TH",
        "Popoldanski obisk zgodovinskega mesta.",
      ),
    ).toBe(true);
  });

  it("blocks Maya Bay on Koh Lipe", () => {
    expect(
      isForeignPoiForRegion(
        "Maya Bay",
        { ...madrid, city: "Koh Lipe" },
        "TH",
        "Popoldanski izlet z ladjo",
      ),
    ).toBe(true);
  });
});

describe("isWrongCityPoi", () => {
  it("drops Maya Bay afternoon trip on Koh Lipe", () => {
    expect(
      isWrongCityPoi("Maya Bay", "Popoldanski izlet — The Beach", "Koh Lipe"),
    ).toBe(true);
  });

  it("keeps Maya Bay in Krabi", () => {
    expect(isWrongCityPoi("Maya Bay", "Celodnevni izlet", "Krabi")).toBe(false);
  });

  it("drops Railay, Ao Nang dinner, and Phi-stub titles on Koh Lipe", () => {
    expect(
      isWrongCityPoi("Rajske plaže Railaya in Phra Nang", "", "Koh Lipe"),
    ).toBe(true);
    expect(
      isWrongCityPoi("Večerja v Ao Nangu: The Hilltop", "The Hilltop", "Koh Lipe"),
    ).toBe(true);
    expect(
      isWrongCityPoi("Celodnevni izlet na otoke Phi", "Phi Phi z Lipeja", "Koh Lipe"),
    ).toBe(true);
    expect(isWrongCityPoi("Railay Beach", "Phra Nang", "Krabi")).toBe(false);
  });

  it("blocks Louvre on a Lyon day and keeps it in Paris", () => {
    expect(isWrongCityPoi("Louvre", "Mona Lisa", "Lyon")).toBe(true);
    expect(isWrongCityPoi("Louvre", "Mona Lisa", "Paris")).toBe(false);
  });

  it("blocks Thailand landmarks that leaked onto the wrong city day", () => {
    expect(
      isWrongCityPoi("Savoey Seafood Restaurant (Patong)", "Večerja na plaži.", "Chiang Mai"),
    ).toBe(true);
    expect(
      isWrongCityPoi("Hiša Jima Thompsona", "Popoldanski ogled svile.", "Koh Samui"),
    ).toBe(true);
    expect(isWrongCityPoi("Večerja v Yaowarat", "Kitajska četrt.", "Koh Samui")).toBe(true);
    expect(isWrongCityPoi("Wat Pho", "Ležeči Buda.", "Bangkok")).toBe(false);
    expect(isWrongCityPoi("Doi Suthep", "Songthaew do templja.", "Chiang Mai")).toBe(false);
    expect(isWrongCityPoi("Wat Phra Yai", "Veliki Buda.", "Koh Samui")).toBe(false);
  });
});

describe("isMorningOnlyPoi", () => {
  it("flags Sagrada Familia", () => {
    expect(isMorningOnlyPoi("Sagrada Familia", "Priporočamo obisk zjutraj")).toBe(true);
  });
});

describe("cleanseRegionHighlights", () => {
  it("removes Louvre and fixes placeholder description", () => {
    const out = cleanseRegionHighlights(
      {
        ...madrid,
        highlights: [
          {
            day: 1,
            name: "Louvre Museum",
            description: "2–3 stavki: kaj vidiš",
            visitDuration: "2h",
          },
          {
            day: 1,
            name: "Plaza Mayor",
            description: "2–3 stavki",
            visitDuration: "2h",
          },
        ],
      },
      { country: "ES" },
    );
    expect(out.some((h) => /louvre/i.test(h.name))).toBe(false);
    expect(out.find((h) => /plaza mayor/i.test(h.name))?.description.length).toBeGreaterThan(20);
  });

  it("removes Soulard market when description says Thu-Sat but day is Tuesday", () => {
    const out = cleanseRegionHighlights(
      {
        ...madrid,
        city: "St. Louis",
        highlights: [
          {
            day: 4,
            name: "Soulard Farmers Market",
            description: "Tržnica je odprta od četrtka do sobote. Obišči zgodaj zjutraj.",
            visitDuration: "2h",
          },
        ],
      },
      { departDate: "2026-06-27", country: "US" },
    );
    expect(out).toHaveLength(0);
  });

  it("removes Sunday Walking Street on Thursday", () => {
    const out = cleanseRegionHighlights(
      {
        ...madrid,
        city: "Chiang Mai",
        highlights: [
          {
            day: 7,
            name: "Bazar nedeljskega večera (Sunday Walking Street)",
            description: "Tržnica ob nedeljah",
            visitDuration: "2h",
          },
        ],
      },
      { departDate: "2026-08-14", country: "TH" },
    );
    expect(out).toHaveLength(0);
  });

  it("removes El Rastro when trip day is not Sunday", () => {
    // 2026-08-14 is Friday; day 11 = Aug 24 Monday
    const out = cleanseRegionHighlights(
      {
        ...madrid,
        startDay: 1,
        endDay: 14,
        highlights: [
          {
            day: 11,
            name: "El Rastro",
            description: "Bolšji sejem v nedeljo zjutraj",
            visitDuration: "2h",
          },
        ],
      },
      { departDate: "2026-08-14", country: "ES" },
    );
    expect(out).toHaveLength(0);
  });
});

describe("poi time gates", () => {
  it("flags Grand Palace as early-closing", () => {
    expect(isEarlyClosingPoi("Grand Palace", "Zapre ob 15:30")).toBe(true);
  });

  it("flags Asiatique as evening-only", () => {
    expect(isEveningOnlyPoi("Asiatique The Riverfront", "Odpre ob 16:00")).toBe(true);
  });

  it("flags Phi Phi as full-day excursion", () => {
    expect(
      isFullDayExcursion({
        name: "Phi Phi Islands",
        description: "Celodnevni izlet z ladjo od 7:00 do 17:00",
        visitDuration: "cel dan",
      }),
    ).toBe(true);
  });
});

describe("slot and geo gates", () => {
  it("flags Khao San and Bangla as nightlife-only", () => {
    expect(isNightlifeOnlyPoi("Khao San Road", "Živahno nočno življenje")).toBe(true);
    expect(isNightlifeOnlyPoi("Bangla Road", "Patong nightlife")).toBe(true);
    expect(isNightlifeOnlyPoi("Bia Hoi Junction", "Pivsko križišče")).toBe(true);
  });

  it("flags closed Bitexco Skydeck as deprecated", () => {
    expect(
      isClosedDeprecatedPoi("Bitexco Financial Tower", "Skydeck razgledna ploščad"),
    ).toBe(true);
  });

  it("flags Chiang Mai Night Bazaar as evening-only", () => {
    expect(isNightlifeOnlyPoi("Chiang Mai Night Bazaar", "Nočni bazar od 18:00")).toBe(true);
    expect(isNightlifeOnlyPoi("Nočni bazar Chiang Mai", "")).toBe(true);
  });

  it("flags Doi Suthep and sunrise text as morning-only", () => {
    expect(isMorningOnlyPoi("Doi Suthep", "Ob sončnem vzhodu")).toBe(true);
    expect(isMorningOnlyPoi("Wat Phra That", "Priporočljivo ob sončnem vzhodu")).toBe(true);
  });

  it("drops Phuket Weekend Night Market on Thursday", () => {
    const out = cleanseRegionHighlights(
      {
        ...madrid,
        city: "Phuket",
        highlights: [
          {
            day: 14,
            name: "Phuket Weekend Night Market (Naka Market)",
            description: "Odprto ob sobotah in nedeljah",
            visitDuration: "2h",
            priceLabel: "—",
            lat: 0,
            lng: 0,
          },
        ],
      },
      { departDate: "2026-10-02", country: "TH" },
    );
    expect(out).toHaveLength(0);
  });

  it("moves Tiger Cave off Emerald Pool day in Krabi", () => {
    const out = splitKrabiHillTempleDays(
      [
        {
          day: 9,
          name: "Emerald Pool",
          description: "Smaragdni bazen.",
          visitDuration: "2h",
          priceLabel: "5 €",
          lat: 7.92,
          lng: 99.25,
        },
        {
          day: 9,
          name: "Tiger Cave Temple",
          description: "1237 stopnic.",
          visitDuration: "3h",
          priceLabel: "—",
          lat: 8.12,
          lng: 98.92,
        },
        {
          day: 8,
          name: "Railay Beach",
          description: "Plaža.",
          visitDuration: "3h",
          priceLabel: "—",
          lat: 8.01,
          lng: 98.84,
        },
      ],
      { city: "Krabi", startDay: 7, endDay: 9 },
    );
    const tiger = out.find((h) => /tiger cave/i.test(h.name));
    const emerald = out.find((h) => /emerald pool/i.test(h.name));
    expect(tiger?.day).not.toBe(emerald?.day);
    expect(tiger?.day).toBeLessThan(9);
  });

  it("moves Tiger Cave off Koh Phi Phi day in Krabi", () => {
    const out = splitKrabiHillTempleDays(
      [
        {
          day: 9,
          name: "Tiger Cave Temple",
          description: "1237 stopnic.",
          visitDuration: "3h",
          priceLabel: "—",
          lat: 8.12,
          lng: 98.92,
        },
        {
          day: 9,
          name: "Koh Phi Phi",
          description: "Celodnevni izlet.",
          visitDuration: "8h",
          priceLabel: "50 €",
          lat: 7.74,
          lng: 98.77,
        },
        { day: 8, name: "Railay Beach", description: "Plaža.", visitDuration: "3h", priceLabel: "—", lat: 8.01, lng: 98.84 },
      ],
      { city: "Krabi", startDay: 7, endDay: 10 },
    );
    const tiger = out.find((h) => /tiger cave/i.test(h.name));
    const phi = out.find((h) => /phi phi/i.test(h.name));
    expect(tiger?.day).not.toBe(phi?.day);
  });

  it("spreads multiple Krabi boat excursions across separate days", () => {
    const out = spreadKrabiBoatExcursions(
      [
        {
          day: 8,
          name: "Bamboo Island",
          description: "Snorkl.",
          visitDuration: "4h",
          priceLabel: "10 €",
          lat: 7.8,
          lng: 98.8,
        },
        {
          day: 8,
          name: "Koh Phi Phi",
          description: "Celodnevni izlet.",
          visitDuration: "8h",
          priceLabel: "10 €",
          lat: 7.74,
          lng: 98.77,
        },
        {
          day: 8,
          name: "Maya Bay",
          description: "The Beach.",
          visitDuration: "3h",
          priceLabel: "12 €",
          lat: 7.67,
          lng: 98.76,
        },
        {
          day: 9,
          name: "Railay Beach",
          description: "Plaža.",
          visitDuration: "3h",
          priceLabel: "—",
          lat: 8.01,
          lng: 98.84,
        },
      ],
      { city: "Krabi", startDay: 7, endDay: 9 },
    );
    const day8Boats = out.filter(
      (h) =>
        h.day === 8 && /phi phi|maya|bamboo/i.test(`${h.name} ${h.description}`),
    );
    expect(day8Boats).toHaveLength(1);
    expect(out.some((h) => h.day === 9 && /phi phi|maya|bamboo/i.test(h.name))).toBe(true);
  });

  it("keeps only one far-apart Bangkok park per day", () => {
    const out = dedupeSameDayGeoConflicts(
      [
        {
          day: 2,
          name: "Chatuchak Park",
          description: "Park",
          visitDuration: "1h",
          priceLabel: "—",
          lat: 0,
          lng: 0,
        },
        {
          day: 2,
          name: "Lumphini Park",
          description: "Park",
          visitDuration: "1h",
          priceLabel: "—",
          lat: 0,
          lng: 0,
        },
      ],
      "Bangkok",
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toMatch(/chatuchak/i);
  });

  it("drops Wat Arun on afternoon arrival day", () => {
    const out = filterArrivalDayHighlights(
      [
        {
          day: 1,
          name: "Wat Arun",
          description: "Ob sončnem zahodu",
          visitDuration: "2h",
          priceLabel: "—",
          lat: 0,
          lng: 0,
        },
      ],
      { outboundDepart: "08:00", outboundArrive: "15:50", outboundArriveDayOffset: 0 },
    );
    expect(out).toHaveLength(0);
  });

  it("drops Erawan when Chatuchak is same Bangkok day", () => {
    const out = dedupeSameDayGeoConflicts(
      [
        {
          day: 17,
          name: "Chatuchak Weekend Market",
          description: "Vikend tržnica",
          visitDuration: "4h",
          priceLabel: "—",
          lat: 0,
          lng: 0,
        },
        {
          day: 17,
          name: "Erawan Shrine",
          description: "Svetišče v centru",
          visitDuration: "1h",
          priceLabel: "—",
          lat: 0,
          lng: 0,
        },
      ],
      "Bangkok",
    );
    expect(out.some((h) => /erawan/i.test(h.name))).toBe(false);
    expect(out.some((h) => /chatuchak/i.test(h.name))).toBe(true);
  });

  it("rewrites Phuket Town leak for Krabi", () => {
    expect(rewriteActivityCityLeak("nočni trg v Phuket Town", "Krabi")).toMatch(/krabi|ao nang/i);
  });

  it("rewrites Phuket Town leak for Koh Lipe", () => {
    expect(
      rewriteActivityCityLeak(
        "Večerja z morskimi sadeži ali nočni trg v Phuket Town.",
        "Koh Lipe",
      ),
    ).not.toMatch(/phuket/i);
  });

  it("strips Bangla Road on departure day", () => {
    const out = filterDepartureDayHighlights(
      [
        {
          day: 15,
          name: "Bangla Road",
          description: "Nočno življenje",
          visitDuration: "2h",
          priceLabel: "—",
          lat: 0,
          lng: 0,
        },
      ],
      "HKT",
      "14:40",
    );
    expect(out).toHaveLength(0);
  });
});

describe("Thailand logistics gates", () => {
  it("flags Maya Bay as full-day excursion", () => {
    expect(
      isFullDayExcursion({ name: "Maya Bay", description: "Zgodnji čoln iz Phuketa", visitDuration: "8h" }),
    ).toBe(true);
  });

  it("flags Promthep Cape as sunset-only", () => {
    expect(isSunsetOnlyPoi("Promthep Cape", "Znan po sončnih zahodih")).toBe(true);
  });

  it("flags Chatuchak as long-form market", () => {
    expect(
      isLongFormMarket({ name: "Tržnica Chatuchak", description: "Vikend tržnica", visitDuration: "4h" }),
    ).toBe(true);
  });

  it("moves Chatuchak off travel-out day to previous Saturday", () => {
    // depart 2026-09-12 (Sat): day 2 = Sun 13, day 3 = Mon 14 — use Fri depart for day3=Sun
    const regions = resolveMarketTravelConflicts(
      [
        {
          ...madrid,
          city: "Bangkok",
          startDay: 1,
          endDay: 3,
          highlights: [
            {
              day: 3,
              name: "Tržnica Chatuchak",
              description: "Vikend tržnica",
              visitDuration: "4h",
              priceLabel: "—",
              lat: 0,
              lng: 0,
            },
          ],
          transportToNext: { type: "train", duration: "1h 30m", costLabel: "15 €", howTo: "Vlak do Ayutthaye" },
        },
      ],
      "2026-09-11",
    );
    const h = regions[0]!.highlights[0]!;
    expect(h.day).toBe(2);
    expect(h.name).toMatch(/chatuchak/i);
  });

  it("drops Sunday Walking Street on Thursday (day 7)", () => {
    const out = cleanseRegionHighlights(
      {
        ...madrid,
        city: "Chiang Mai",
        startDay: 5,
        endDay: 8,
        highlights: [
          {
            day: 7,
            name: "Bazar nedeljskega večera",
            description: "Vsako nedeljo zvečer",
            visitDuration: "2h",
            priceLabel: "—",
            lat: 0,
            lng: 0,
          },
        ],
      },
      { departDate: "2026-09-12", country: "TH" },
    );
    expect(out).toHaveLength(0);
  });

  it("strips island trips on travel-out day", () => {
    const out = filterTravelOutDayHighlights(
      [
        {
          day: 8,
          name: "Maya Bay",
          description: "Phi Phi izlet",
          visitDuration: "cel dan",
          priceLabel: "80 €",
          lat: 0,
          lng: 0,
        },
        {
          day: 8,
          name: "Plaža Kata",
          description: "Sproščanje",
          visitDuration: "2h",
          priceLabel: "—",
          lat: 0,
          lng: 0,
        },
      ],
      { type: "flight", duration: "2h", howTo: "Notranji let" },
    );
    expect(out.some((h) => /maya/i.test(h.name))).toBe(false);
    expect(out.some((h) => /kata/i.test(h.name))).toBe(true);
  });

  it("clears sights on inbound flight day (Maya Bay waits for next day)", () => {
    const out = filterInboundTravelDayHighlights([
      {
        day: 9,
        name: "Prevoz: Chiang Mai → Phuket",
        description: "Notranji let",
        visitDuration: "cel dan",
        priceLabel: "120 €",
        lat: 0,
        lng: 0,
      },
      {
        day: 9,
        name: "Maya Bay",
        description: "Izlet",
        visitDuration: "cel dan",
        priceLabel: "80 €",
        lat: 0,
        lng: 0,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toMatch(/prevoz/i);
  });

  it("returns empty highlights when inbound day has only sights", () => {
    const out = filterInboundTravelDayHighlights([
      {
        day: 9,
        name: "Maya Bay",
        description: "Izlet",
        visitDuration: "cel dan",
        priceLabel: "80 €",
        lat: 0,
        lng: 0,
      },
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("filterArrivalDayHighlights", () => {
  it("drops Grand Palace after 14:50 landing", () => {
    const out = filterArrivalDayHighlights(
      [
        {
          day: 1,
          name: "Grand Palace",
          description: "Glavna atrakcija",
          visitDuration: "3h",
          priceLabel: "500 THB",
          lat: 0,
          lng: 0,
        },
        {
          day: 1,
          name: "Khao San Road",
          description: "Večernja ulica",
          visitDuration: "2h",
          priceLabel: "—",
          lat: 0,
          lng: 0,
        },
      ],
      {
        outboundDepart: "08:00",
        outboundArrive: "14:50",
        outboundArriveDayOffset: 0,
      },
    );
    expect(out.some((h) => /grand palace/i.test(h.name))).toBe(false);
    expect(out.length).toBeLessThanOrEqual(2);
  });
});

describe("weekday-gated POIs", () => {
  it("flags Chatuchak closed on Tuesday (day 17 from Jul 26 2026)", () => {
    expect(
      isPoiOpenOnTripDay(
        "Chatuchak Weekend Market",
        "Vikend tržnica",
        "2026-07-26",
        17,
      ),
    ).toBe(false);
  });

  it("swaps Chatuchak for ICONSIAM on weekday afternoon", () => {
    const out = reconcileWeekdayGatedActivities(
      {
        morning: [],
        afternoon: [
          {
            name: "Terminal 21",
            type: "SIGHT",
            description: "Nakupovalni center.",
          },
          {
            name: "Chatuchak Weekend Market",
            type: "SIGHT",
            description: "Vikend tržnica — sobota in nedelja.",
          },
        ],
        evening: [],
      },
      "2026-07-26",
      17,
      "sl",
    );
    expect(out.afternoon.some((a) => /chatuchak/i.test(a.name))).toBe(false);
    expect(out.afternoon.some((a) => /iconsiam|siam paragon/i.test(a.name))).toBe(true);
    expect(out.afternoon.some((a) => /terminal 21/i.test(a.name))).toBe(true);
  });
});

describe("isHeavyRegionalTravel", () => {
  it("treats Bangkok → Ayutthaya train (1–1.5h) as light hop", () => {
    expect(
      isHeavyRegionalTravel({
        type: "train",
        duration: "1–1.5h",
        howTo: "Izlet iz Bangkoka.",
      }),
    ).toBe(false);
  });

  it("treats Krabi → Koh Lipe ferry as heavy", () => {
    expect(
      isHeavyRegionalTravel({
        type: "ferry",
        duration: "4–6h",
        howTo: "Pakbara speedboat.",
      }),
    ).toBe(true);
  });
});

describe("Ayutthaya temple pricing", () => {
  it("fixes wrong free label on Wat Mahathat", () => {
    expect(fixPoiPriceLabel("Wat Mahathat", "brezplačno", "sl")).toBe("50 THB (~1,5 €)");
  });

  it("fixes wrong free label on Wat Ratchaburana", () => {
    expect(fixPoiPriceLabel("Wat Ratchaburana", "brezplačno", "sl")).toBe("50 THB (~1,5 €)");
  });

  it("prepends Wat Phra Si Sanphet on Ayutthaya arrival day", () => {
    const out = ensureAyutthayaArrivalHighlights(
      [
        {
          day: 4,
          name: "Wat Mahathat",
          description: "Glava Bude.",
          visitDuration: "1h",
          priceLabel: "50 THB",
          lat: 14.35,
          lng: 100.56,
        },
      ],
      4,
    );
    expect(out[0]?.name).toMatch(/sanphet/i);
    expect(out.some((h) => /mahathat/i.test(h.name))).toBe(true);
  });

  it("fixes Wat Phra Si Sanphet in cleanseRegionHighlights", () => {
    const out = cleanseRegionHighlights(
      {
        ...madrid,
        city: "Ayutthaya",
        startDay: 3,
        endDay: 3,
        highlights: [
          {
            day: 3,
            name: "Wat Phra Si Sanphet",
            description: "2–3 stavki",
            visitDuration: "2h",
            priceLabel: "brezplačno",
            lat: 0,
            lng: 0,
          },
        ],
      },
      { departDate: "2026-07-26", country: "TH" },
    );
    expect(out[0]!.priceLabel).toBe("50 THB (~1,5 €)");
    expect(out[0]!.description).toMatch(/50 THB/i);
  });
});
