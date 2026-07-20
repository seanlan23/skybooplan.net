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

describe("buildFallbackTravelRequirements Spain / Schengen", () => {
  it("states free movement for EU travellers to Madrid", () => {
    const req = buildFallbackTravelRequirements("LJU", "MAD", "en");
    expect(req?.visaInfo[0]!.requirement).toMatch(/free movement|do not need a visa/i);
    expect(req?.visaInfo[0]!.requirement).not.toMatch(/Check current visa requirements/i);
    expect(req?.vaccinations).toMatch(/No special travel vaccines|routine/i);
    expect(req?.estimatedCosts).toMatch(/€0|Visa: €0/i);
  });

  it("uses Slovenian free-movement copy for Spain", () => {
    const req = buildFallbackTravelRequirements("LJU", "MAD", "sl");
    expect(req?.visaInfo[0]!.requirement).toMatch(/ne potrebujejo vize|prosti pretok/i);
  });

  it("works without origin IATA (motorhome)", () => {
    const req = buildFallbackTravelRequirements("", "MAD", "en");
    expect(req?.targetResidents).toEqual(["EU"]);
    expect(req?.visaInfo[0]!.requirement).toMatch(/visa/i);
  });
});

describe("resolveTravelRequirements replaces generic AI copy", () => {
  it("swaps boilerplate for curated Spain pack", async () => {
    const { resolveTravelRequirements } = await import("@/lib/travelRequirements");
    const resolved = resolveTravelRequirements(
      {
        targetResidents: ["EU"],
        visaInfo: [
          {
            country: "EU",
            requirement:
              "Check current visa requirements for travellers with passports from EU entering Madrid (MAD). Rules change often — always verify official sources before you go.",
            howToApply: "Use your foreign ministry site.",
          },
        ],
        vaccinations: "See a travel clinic 4–6 weeks before departure.",
        estimatedCosts: "Visa and vaccine costs vary by destination — budget about €0–150 per person.",
      },
      "LJU",
      "MAD",
      "en",
    );
    expect(resolved?.visaInfo[0]!.requirement).toMatch(/free movement|do not need a visa/i);
    expect(resolved?.visaInfo[0]!.requirement).not.toMatch(/Check current visa requirements/i);
  });
});
