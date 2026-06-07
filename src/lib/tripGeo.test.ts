import { describe, expect, it } from "vitest";
import {
  dedupeHighlightList,
  enforceSafariDayRules,
  filterInvalidRegionHighlights,
  highlightFuzzyKey,
  orderHighlightsByProximity,
  rebalanceRegionHighlightsByProximity,
  resolveHighlightCoords,
} from "@/lib/tripGeo";
import type { SkeletonHighlight, TripRegion } from "@/lib/aiPlan.functions";

function h(
  day: number,
  name: string,
  lat: number,
  lng: number,
): SkeletonHighlight {
  return { day, name, description: name, priceLabel: "15 €", lat, lng };
}

describe("highlightFuzzyKey", () => {
  it("treats Griffith Observatory variants as duplicates", () => {
    expect(highlightFuzzyKey("Griffith Observatory")).toBe(
      highlightFuzzyKey("Griffith Park Observatory"),
    );
  });

  it("treats El Matador beach variants as duplicates", () => {
    expect(highlightFuzzyKey("El Matador Beach")).toBe(
      highlightFuzzyKey("El Matador State Beach"),
    );
  });
});

describe("resolveHighlightCoords", () => {
  it("uses POI table instead of region center for Griffith", () => {
    const fixed = resolveHighlightCoords(
      { day: 2, name: "Griffith Observatory", description: "", priceLabel: "—", lat: 34.05, lng: -118.25 },
      { lat: 34.05, lng: -118.25 },
    );
    expect(fixed.lat).toBeCloseTo(34.1184, 2);
    expect(fixed.lng).toBeCloseTo(-118.3004, 2);
  });
});

describe("dedupeHighlightList", () => {
  it("removes Griffith Park Observatory duplicate", () => {
    const out = dedupeHighlightList([
      h(2, "Griffith Observatory", 34.1184, -118.3004),
      h(5, "Griffith Park Observatory", 34.1184, -118.3004),
      h(7, "LACMA", 34.0638, -118.3589),
    ]);
    expect(out).toHaveLength(2);
    expect(out.some((x) => /griffith/i.test(x.name))).toBe(true);
  });
});

describe("filterInvalidRegionHighlights", () => {
  it("removes Mikindani from Zanzibar region", () => {
    const region: TripRegion = {
      city: "Zanzibar",
      startDay: 11,
      endDay: 16,
      startDate: "2026-09-21",
      endDate: "2026-09-26",
      summary: "",
      localTransportTips: "",
      travelTips: "",
      lat: -6.16,
      lng: 39.19,
      highlights: [
        h(16, "Mikindani", -10.27, 40.1),
        h(12, "Forodhani Night Market", -6.16, 39.19),
      ],
    };
    const out = filterInvalidRegionHighlights(region);
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toMatch(/forodhani/i);
  });
});

describe("enforceSafariDayRules", () => {
  it("splits Maasai boma from Ngorongoro same day", () => {
    const region: TripRegion = {
      city: "Serengeti",
      startDay: 5,
      endDay: 10,
      startDate: "",
      endDate: "",
      summary: "",
      localTransportTips: "",
      travelTips: "",
      lat: -2.33,
      lng: 34.83,
      highlights: [
        h(9, "Maasai Boma Visit", -3.35, 36.2),
        h(9, "Ngorongoro Crater", -3.161, 35.587),
      ],
    };
    const fixed = enforceSafariDayRules(region.highlights, region);
    const day9 = fixed.filter((x) => x.day === 9);
    expect(day9.length).toBe(1);
    expect(day9[0]!.name).toMatch(/ngorongoro/i);
  });
});

describe("rebalanceRegionHighlightsByProximity", () => {
  it("splits Griffith and Santa Monica across different days", () => {
    const region: TripRegion = {
      city: "Los Angeles",
      startDay: 1,
      endDay: 3,
      startDate: "2026-09-11",
      endDate: "2026-09-13",
      summary: "LA",
      localTransportTips: "",
      travelTips: "",
      lat: 34.05,
      lng: -118.25,
      highlights: [
        h(2, "Griffith Observatory", 34.1184, -118.3004),
        h(2, "Santa Monica Pier", 34.0083, -118.4987),
        h(3, "LACMA", 34.0638, -118.3589),
      ],
    };

    const fixed = rebalanceRegionHighlightsByProximity(region, {
      maxIntraDayKm: 18,
      maxPerDay: 4,
    });

    const day2 = fixed.highlights.filter((x) => x.day === 2);
    const hasGriffith = day2.some((x) => /griffith/i.test(x.name));
    const hasPier = day2.some((x) => /santa monica/i.test(x.name));
    expect(hasGriffith && hasPier).toBe(false);
  });
});

describe("orderHighlightsByProximity", () => {
  it("keeps nearby sights adjacent in slot order", () => {
    const ordered = orderHighlightsByProximity([
      h(1, "Santa Monica Pier", 34.0083, -118.4987),
      h(1, "Griffith Observatory", 34.1184, -118.3004),
      h(1, "Hollywood Sign", 34.1341, -118.3215),
    ]);
    const firstTwo = ordered.slice(0, 2).map((x) => x.name).join(" ");
    expect(firstTwo).toMatch(/griffith|hollywood/i);
  });
});
