import { describe, expect, it } from "vitest";
import {
  annotateDayAstronomy,
  buildTripAstronomy,
  isBioluminescencePoi,
  isLowTideDependentPoi,
  moonPhaseForDate,
  stripMoonHintSpam,
} from "@/lib/lunarTides";

describe("moonPhaseForDate", () => {
  it("detects full moon near 2026-07-29", () => {
    const moon = moonPhaseForDate("2026-07-29", "sl");
    expect(moon.isFullMoon).toBe(true);
    expect(moon.name).toMatch(/polna luna/i);
    expect(moon.bioluminescenceFriendly).toBe(false);
  });

  it("detects dark moon friendly to bioluminescence", () => {
    const moon = moonPhaseForDate("2026-08-12", "sl");
    expect(moon.illumination).toBeLessThan(0.35);
    expect(moon.bioluminescenceFriendly).toBe(true);
  });
});

describe("POI matchers", () => {
  it("flags James Bond cave as low-tide dependent", () => {
    expect(
      isLowTideDependentPoi(
        "James Bond Island",
        "Snorkljanje v podvodni jami — ob nizkem plimovanju.",
      ),
    ).toBe(true);
  });

  it("flags bioluminescence activities", () => {
    expect(isBioluminescencePoi("Snorkljanje & bioluminiscenca", "Koh Rong")).toBe(true);
  });
});

describe("buildTripAstronomy", () => {
  it("suggests bioluminescence nights for TH beach trip in July-Aug", () => {
    const out = buildTripAstronomy({
      departDate: "2026-07-26",
      returnDate: "2026-08-13",
      lang: "sl",
      regionCities: ["Koh Lipe", "Krabi"],
    });
    expect(out.bestBioluminescenceDates.length).toBeGreaterThan(0);
    expect(out.tripHints.some((h) => /biolumin|mlaj|temnej/i.test(h))).toBe(true);
  });

  it("mentions full moon when trip spans one", () => {
    const out = buildTripAstronomy({
      departDate: "2026-07-26",
      returnDate: "2026-08-13",
      lang: "sl",
      regionCities: ["Koh Lipe"],
    });
    expect(out.fullMoonDates.length).toBeGreaterThan(0);
    expect(out.tripHints.some((h) => /polna luna/i.test(h))).toBe(true);
  });

  it("does not show bioluminescence or tide tips for New York", () => {
    const out = buildTripAstronomy({
      departDate: "2026-09-03",
      returnDate: "2026-09-10",
      lang: "sl",
      lat: 40.7128,
      lng: -74.006,
      destinationLabel: "New York",
      regionCities: ["New York"],
    });
    expect(out.tripHints).toEqual([]);
  });
});

describe("stripMoonHintSpam", () => {
  it("removes duplicated full-moon footnotes", () => {
    const raw =
      "Jama za potapljanje. Polna luna v teh dneh — odlična večerna fotografija na plaži; bioluminiscenca na morju bo šibka.";
    expect(stripMoonHintSpam(raw)).toBe("Jama za potapljanje.");
  });
});

describe("annotateDayAstronomy", () => {
  it("adds full-moon beach photo note on sunset activities", () => {
    const out = annotateDayAstronomy(
      {
        morning: [],
        afternoon: [],
        evening: [
          {
            name: "Sunset Beach",
            description: "Mirna plaža z sončnim zahodom.",
            type: "ACTIVITY",
          },
        ],
      },
      "2026-11-24",
      "sl",
    );
    expect(out.evening[0]!.description).toMatch(/polna luna/i);
    expect(out.evening[0]!.description).toMatch(/bioluminiscenca.*šibka|šibka/i);
  });

  it("adds dark-moon note to bioluminescence evening", () => {
    const out = annotateDayAstronomy(
      {
        morning: [],
        afternoon: [],
        evening: [
          {
            name: "Bioluminiscenca",
            description: "Večernji izlet.",
            type: "ACTIVITY",
          },
        ],
      },
      "2026-08-12",
      "sl",
    );
    expect(out.evening[0]!.description).toMatch(/temna luna|biolumin/i);
  });

  it("moves low-tide cave from morning to afternoon when tide data present", () => {
    const out = annotateDayAstronomy(
      {
        morning: [
          {
            name: "Modra jama",
            description: "Vstop z ladjo ob nizkem plimovanju.",
            type: "SIGHT",
          },
        ],
        afternoon: [],
        evening: [],
      },
      "2026-08-05",
      "sl",
      {
        date: "2026-08-05",
        extremes: [],
        lowTideAfternoon: {
          type: "Low",
          dateTime: "2026-08-05T14:30:00",
          timeLocal: "14:30",
          heightM: 0.4,
        },
      },
    );
    expect(out.morning.some((a) => /jama/i.test(a.name))).toBe(false);
    expect(out.afternoon.some((a) => /jama/i.test(a.name))).toBe(true);
    expect(out.afternoon[0]!.description).toMatch(/14:30|nizka plima/i);
  });
});
