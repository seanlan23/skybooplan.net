import { describe, expect, it } from "vitest";
import {
  buildFallbackTravelRequirements,
  collapseResidentLabels,
  groupVisaInfoEntries,
} from "@/lib/travelRequirements";

describe("groupVisaInfoEntries", () => {
  it("merges identical visa rows into EU when all Schengen", () => {
    const grouped = groupVisaInfoEntries([
      { country: "Slovenia", requirement: "Same", howToApply: "Apply" },
      { country: "Austria", requirement: "Same", howToApply: "Apply" },
      { country: "Italy", requirement: "Same", howToApply: "Apply" },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.country).toBe("EU / Schengen");
  });

  it("keeps non-EU countries separate", () => {
    const grouped = groupVisaInfoEntries([
      { country: "Slovenia", requirement: "Same", howToApply: "Apply" },
      { country: "United States", requirement: "Different", howToApply: "Apply" },
    ]);
    expect(grouped).toHaveLength(2);
  });
});

describe("collapseResidentLabels", () => {
  it("collapses Central European hubs to EU", () => {
    expect(
      collapseResidentLabels(["Slovenia", "Austria", "Italy", "Croatia"]),
    ).toEqual(["EU"]);
  });

  it("keeps non-EU beside EU", () => {
    expect(collapseResidentLabels(["Germany", "United States"])).toEqual([
      "EU",
      "United States",
    ]);
  });
});

describe("buildFallbackTravelRequirements Thailand", () => {
  it("uses EU label and English 30-day rule by default", () => {
    const req = buildFallbackTravelRequirements("LJU", "BKK", "en");
    expect(req?.targetResidents).toEqual(["EU"]);
    expect(req?.visaInfo).toHaveLength(1);
    expect(req?.visaInfo[0]!.country).toBe("EU / Schengen");
    expect(req?.visaInfo[0]!.requirement).toMatch(/30 days/i);
    expect(req?.visaInfo[0]!.requirement).not.toMatch(/državljan/i);
  });

  it("keeps Slovenian copy when lang is sl", () => {
    const req = buildFallbackTravelRequirements("LJU", "BKK", "sl");
    expect(req?.visaInfo[0]!.requirement).toMatch(/30 dni/);
    expect(req?.visaInfo[0]!.requirement).not.toMatch(/60 dni brezvizumskega/);
  });
});
