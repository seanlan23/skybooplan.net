import { describe, expect, it } from "vitest";
import {
  collectMotorhomeRoadTripStops,
  disambiguateMapPlaceQuery,
  isCampActivityName,
  isCountryOnlyPlaceLabel,
  sanitizeMapPlaceLabel,
} from "@/lib/motorhomeRoute";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { parseChatDateRange, parseChatPassengers } from "@/lib/heroChatPlanner";
import { translate, SUPPORTED_LANGS } from "@/lib/i18n";
import { inferMapPoiCategoryFromText } from "@/lib/mapPoiCategory";

describe("motorhome route + camps", () => {
  it("detects campground names", () => {
    expect(isCampActivityName("Camping Adriatic")).toBe(true);
    expect(isCampActivityName("Avtokamp Stobreč")).toBe(true);
    expect(isCampActivityName("Prihod v Kamp Heidelberg")).toBe(true);
    expect(isCampActivityName("Grand Palace")).toBe(false);
    // Description mentioning camp must not promote a boat-ride title
    expect(
      isCampActivityName(
        "Jutranja vožnja z ladjo v Benetke",
        "Return to camping after the ride",
      ),
    ).toBe(false);
  });

  it("strips arrival narrative before Google Maps place queries", () => {
    expect(sanitizeMapPlaceLabel("Prihod v Kamp Heidelberg")).toBe("Kamp Heidelberg");
    expect(sanitizeMapPlaceLabel("Arrival at Camping Nord-Sam")).toBe("Camping Nord-Sam");

    const plan = {
      originPlace: "Slovenj Gradec",
      destinationPlace: "North Holland, NL",
      groundTransportMode: "motorhome",
      days: [
        {
          day: 1,
          city: "Salzburg",
          activities: {
            evening: [
              { name: "Camping Nord-Sam", type: "hotel", description: "kamp" },
            ],
          },
        },
        {
          day: 4,
          city: "Heidelberg",
          activities: {
            afternoon: [
              {
                name: "Prihod v Kamp Heidelberg",
                type: "hotel",
                description: "overnight",
              },
            ],
          },
        },
      ],
    } as AiTripPlan;

    const stops = collectMotorhomeRoadTripStops(plan);
    expect(stops.every((s) => !/prihod|arrival/i.test(s))).toBe(true);
    expect(stops.some((s) => /^Kamp Heidelberg/i.test(s))).toBe(true);
    expect(stops[0]).toMatch(/Slovenj Gradec/i);
  });

  it("never sends activity sentences as Maps stops", () => {
    const plan = {
      originPlace: "Vienna",
      destinationPlace: "Croatia",
      groundTransportMode: "motorhome",
      days: [
        {
          day: 1,
          city: "Venice",
          activities: {
            morning: [
              {
                name: "Jutranja vožnja z ladjo v Benetke",
                type: "SIGHT",
                description: "Boat ride then back to camping Fusina",
              },
            ],
            evening: [
              {
                name: "Camping Fusina",
                type: "hotel",
                description: "RV park",
              },
            ],
          },
        },
      ],
    } as AiTripPlan;
    const stops = collectMotorhomeRoadTripStops(plan);
    expect(stops.every((s) => !/vožnja|ladjo|jutranja/i.test(s))).toBe(true);
    expect(stops.some((s) => /Camping Fusina/i.test(s))).toBe(true);
  });

  it("builds Google-ready stops preferring overnight camps and returns home", () => {
    const plan = {
      originPlace: "Vienna",
      destinationPlace: "Split",
      groundTransportMode: "motorhome",
      accommodationMode: "motorhome",
      days: [
        {
          day: 1,
          city: "Ljubljana",
          activities: {
            evening: [
              {
                name: "Camping Ljubljana Resort",
                type: "hotel",
                description: "RV park outside centre",
              },
            ],
          },
        },
        {
          day: 2,
          city: "Zadar",
          activities: {
            morning: [{ name: "Old town", type: "SIGHT", description: "Walk" }],
            evening: [
              { name: "Avtokamp Zadar", type: "hotel", description: "kamp ob morju" },
            ],
          },
        },
      ],
    } as AiTripPlan;

    const stops = collectMotorhomeRoadTripStops(plan);
    expect(stops[0]).toMatch(/Vienna/i);
    expect(stops.some((s) => /Camping Ljubljana/i.test(s))).toBe(true);
    expect(stops.some((s) => /Avtokamp Zadar/i.test(s))).toBe(true);
    expect(stops.some((s) => /^Split(,\s*Croatia)?$/i.test(s))).toBe(true);
    // Loop home — last pin is origin, not a country blob.
    expect(stops[stops.length - 1]).toMatch(/Vienna/i);
  });

  it("ends at Mežica and never pins bare Italija", () => {
    const plan = {
      originPlace: "Mežica",
      destinationPlace: "Italija",
      groundTransportMode: "motorhome",
      days: [
        { day: 1, city: "San Daniele del Friuli", activities: {} },
        { day: 2, city: "Venice", activities: {} },
        { day: 3, city: "Rome", activities: {} },
        { day: 4, city: "Trieste", activities: {} },
        { day: 5, city: "Mežica", title: "Povratek", activities: {} },
      ],
    } as AiTripPlan;
    const stops = collectMotorhomeRoadTripStops(plan);
    expect(stops.some((s) => /^italija$/i.test(s))).toBe(false);
    expect(stops[0]).toBe("Mežica");
    expect(stops[stops.length - 1]).toBe("Mežica");
    expect(stops.filter((s) => s === "Mežica")).toHaveLength(2);
  });

  it("maps campground text to hotel category (camp pin budget)", () => {
    expect(inferMapPoiCategoryFromText("Avtokamp Poreč overnight")).toBe("hotel");
  });

  it("disambiguates Berat so Maps does not open Berat Grill in Germany", () => {
    expect(disambiguateMapPlaceQuery("Berat")).toBe("Berat, Albania");
    expect(disambiguateMapPlaceQuery("Shkoder")).toBe("Shkodër, Albania");
    expect(disambiguateMapPlaceQuery("Kotor")).toBe("Kotor, Montenegro");
    expect(disambiguateMapPlaceQuery("Vlore")).toBe("Vlorë, Albania");
    expect(disambiguateMapPlaceQuery("Ohrid")).toBe("Ohrid, North Macedonia");
    expect(disambiguateMapPlaceQuery("Dunaj")).toBe("Vienna, Austria");
    expect(isCountryOnlyPlaceLabel("Albania, AL")).toBe(true);
    expect(isCountryOnlyPlaceLabel("Albanija")).toBe(true);

    const plan = {
      originPlace: "Dunaj",
      destinationPlace: "Albania, AL",
      groundTransportMode: "car",
      days: [
        { day: 1, city: "Split", activities: { morning: [], afternoon: [], evening: [] } },
        { day: 3, city: "Shkoder", activities: { morning: [], afternoon: [], evening: [] } },
        { day: 4, city: "Tirana", activities: { morning: [], afternoon: [], evening: [] } },
        { day: 5, city: "Berat", activities: { morning: [], afternoon: [], evening: [] } },
        { day: 7, city: "Gjirokaster", activities: { morning: [], afternoon: [], evening: [] } },
        { day: 8, city: "Sarande", activities: { morning: [], afternoon: [], evening: [] } },
        { day: 11, city: "Ohrid", activities: { morning: [], afternoon: [], evening: [] } },
      ],
    } as AiTripPlan;

    const stops = collectMotorhomeRoadTripStops(plan);
    // VIE.pdf horror: bare "Berat" / Balkan cities geocoded to DE bike shops (~5800 km).
    expect(stops[0]).toMatch(/Vienna,\s*Austria/i);
    expect(stops.some((s) => /^Berat,\s*Albania$/i.test(s))).toBe(true);
    expect(stops.every((s) => !/^Berat$/i.test(s))).toBe(true);
    expect(stops.every((s) => !/^Albania/i.test(s))).toBe(true);
    expect(stops.some((s) => /Gjirokastër,\s*Albania/i.test(s))).toBe(true);
    expect(stops.some((s) => /Ohrid,\s*North Macedonia/i.test(s))).toBe(true);
    expect(stops.every((s) => !/velo|braunschweig|atelier/i.test(s))).toBe(true);
  });
});

describe("motorhome i18n browser keys", () => {
  it("has mh.browser.search in every UI language", () => {
    for (const lang of SUPPORTED_LANGS) {
      const v = translate(lang, "mh.browser.search");
      expect(v).not.toBe("mh.browser.search");
      expect(v.trim().length).toBeGreaterThan(3);
    }
    expect(translate("de", "mh.browser.search")).toMatch(/route|suchen/i);
    expect(translate("sl", "mh.browser.from")).toMatch(/od kod/i);
  });
});

describe("ISO date range + passenger parse", () => {
  it("parses Skyscanner-style ISO range", () => {
    const r = parseChatDateRange("2026-08-01 – 2026-08-12", "en");
    expect(r.departDate).toBe("2026-08-01");
    expect(r.returnDate).toBe("2026-08-12");
  });

  it("parses DE/FR adult labels", () => {
    expect(parseChatPassengers("2 Erwachsene, 1 Kind").adults).toBe(2);
    expect(parseChatPassengers("2 Erwachsene, 1 Kind").childrenAges).toHaveLength(1);
    expect(parseChatPassengers("2 adults").adults).toBe(2);
  });
});
