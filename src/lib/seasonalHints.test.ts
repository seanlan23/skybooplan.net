import { describe, expect, it } from "vitest";
import {
  buildTripClimate,
  getSeasonalHints,
  inferLikelyRegionCities,
  tripMonths,
} from "@/lib/seasonalHints";

describe("tripMonths", () => {
  it("spans Jul–Aug for Thailand summer trip", () => {
    expect(tripMonths("2026-07-26", "2026-08-13")).toEqual([7, 8]);
  });
});

describe("buildTripClimate Phase 2", () => {
  it("adds Chiang Mai north-rain hint for beach route in July", () => {
    const out = buildTripClimate({
      destinationIata: "BKK",
      departDate: "2026-07-26",
      returnDate: "2026-08-13",
      lang: "sl",
      priorities: ["beaches", "sights", "nightlife"],
    });
    expect(out.tripClimate.some((h) => /deževna sezona na tajskem/i.test(h))).toBe(true);
    const chiang = out.regionClimate.find((r) => /chiang mai/i.test(r.city));
    expect(chiang?.hints.some((h) => /severni tajska|chiang mai/i.test(h))).toBe(true);
  });

  it("adds Andaman monsoon hint for Koh Lipe in August", () => {
    const out = buildTripClimate({
      destinationIata: "BKK",
      departDate: "2026-07-26",
      returnDate: "2026-08-13",
      lang: "sl",
      priorities: ["beaches", "sights", "nightlife"],
      regionCities: ["Koh Lipe"],
    });
    expect(out.regionClimate[0]?.hints.some((h) => /andaman|koh lipe|monsun/i.test(h))).toBe(
      true,
    );
  });

  it("warns about rainforest when nature interest selected in rainy months", () => {
    const out = buildTripClimate({
      destinationIata: "BKK",
      departDate: "2026-07-26",
      returnDate: "2026-08-13",
      lang: "sl",
      priorities: ["beaches", "nature", "hikes"],
    });
    expect(out.tripClimate.some((h) => /gozd|pohod|deževni/i.test(h))).toBe(true);
  });

  it("mentions Khao Sok when wishes mention rainforest", () => {
    const out = buildTripClimate({
      destinationIata: "BKK",
      departDate: "2026-07-26",
      returnDate: "2026-08-13",
      lang: "sl",
      wishes: "Khao Sok in deževni gozd",
      regionCities: ["Khao Sok"],
    });
    const khao = out.regionClimate.find((r) => /khao sok/i.test(r.city));
    expect(khao?.hints.some((h) => /gozd|blatne/i.test(h))).toBe(true);
  });

  it("does not add north Thailand hint in cool dry season", () => {
    const out = buildTripClimate({
      destinationIata: "BKK",
      departDate: "2026-01-10",
      returnDate: "2026-01-20",
      lang: "sl",
      regionCities: ["Chiang Mai"],
    });
    expect(out.regionClimate).toHaveLength(0);
  });
});

describe("inferLikelyRegionCities", () => {
  it("returns TH beach route cities from priorities", () => {
    const cities = inferLikelyRegionCities("BKK", ["beaches", "sights", "nightlife"]);
    expect(cities).toContain("Chiang Mai");
    expect(cities).toContain("Koh Lipe");
  });
});

describe("getSeasonalHints back-compat", () => {
  it("returns country hint for BKK in July", () => {
    const hints = getSeasonalHints("BKK", "2026-07-26", "sl", {
      returnDate: "2026-08-13",
      priorities: ["beaches", "sights", "nightlife"],
    });
    expect(hints.some((h) => /deževna sezona/i.test(h))).toBe(true);
  });
});
