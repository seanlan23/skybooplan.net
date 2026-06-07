import { describe, expect, it } from "vitest";
import {
  defaultPicksForCities,
  estimateCatalogBudget,
  getCatalogForCities,
  resolvePickerBlueprint,
} from "@/lib/attractionCatalog";
import { distributePicksInRegion } from "@/lib/applyPickedAttractions";

describe("attractionCatalog", () => {
  it("resolves Thailand beach route cities for BKK 21d", () => {
    const blueprint = resolvePickerBlueprint({
      nDays: 21,
      destinationIata: "BKK",
      priorities: ["beaches", "sights", "nature"],
    });
    expect(blueprint?.map((b) => b.city)).toContain("Bangkok");
    expect(blueprint?.map((b) => b.city)).toContain("Krabi");
    expect(blueprint?.map((b) => b.city)).toContain("Koh Lipe");
  });

  it("lists attractions per city with prices", () => {
    const items = getCatalogForCities(["Bangkok", "Krabi"]);
    expect(items.some((a) => /grand palace/i.test(a.nameEn))).toBe(true);
    expect(items.some((a) => a.priceEurMax > 0)).toBe(true);
  });

  it("estimates group budget from picks", () => {
    const ids = defaultPicksForCities(["Bangkok", "Krabi"]);
    const est = estimateCatalogBudget(ids, 3);
    expect(est.pickCount).toBeGreaterThan(3);
    expect(est.groupMin).toBeGreaterThan(0);
    expect(est.groupMax).toBeGreaterThanOrEqual(est.groupMin);
  });

  it("puts Phi Phi alone on one Krabi day", () => {
    const region = { city: "Krabi", startDay: 7, endDay: 12 };
    const highlights = distributePicksInRegion(
      region,
      ["th-kbv-phi-phi", "th-kbv-railay", "th-kbv-emerald"],
      "sl",
    );
    const phiDay = highlights.find((h) => /phi phi|maya/i.test(h.name))?.day;
    const railDay = highlights.find((h) => /railay/i.test(h.name))?.day;
    expect(phiDay).toBeDefined();
    expect(railDay).toBeDefined();
    expect(phiDay).not.toBe(railDay);
  });
});
