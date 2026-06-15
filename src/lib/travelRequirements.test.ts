import { describe, expect, it } from "vitest";
import {
  buildFallbackTravelRequirements,
  groupVisaInfoEntries,
} from "@/lib/travelRequirements";

describe("groupVisaInfoEntries", () => {
  it("merges identical visa rows into one line", () => {
    const grouped = groupVisaInfoEntries([
      { country: "Slovenia", requirement: "Same", howToApply: "Apply" },
      { country: "Austria", requirement: "Same", howToApply: "Apply" },
      { country: "Italy", requirement: "Different", howToApply: "Apply" },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]!.country).toBe("Slovenia · Austria");
  });
});

describe("buildFallbackTravelRequirements Thailand", () => {
  it("groups LJU hub residents and uses 30-day rule", () => {
    const req = buildFallbackTravelRequirements("LJU", "BKK");
    expect(req?.visaInfo).toHaveLength(1);
    expect(req?.visaInfo[0]!.country).toContain("Slovenia");
    expect(req?.visaInfo[0]!.country).toContain("Croatia");
    expect(req?.visaInfo[0]!.requirement).toMatch(/30 dni/);
    expect(req?.visaInfo[0]!.requirement).not.toMatch(/60 dni brezvizumskega/);
  });
});
