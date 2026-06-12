import { describe, expect, it } from "vitest";
import { targetResidentsForOrigin } from "./originResidents";

describe("targetResidentsForOrigin", () => {
  it("returns Central European residents for Vienna (VIE)", () => {
    expect(targetResidentsForOrigin("VIE")).toEqual([
      "Slovenia",
      "Austria",
      "Czech Republic",
      "Slovakia",
    ]);
  });

  it("returns neighbours for Ljubljana (LJU)", () => {
    expect(targetResidentsForOrigin("LJU")).toContain("Slovenia");
    expect(targetResidentsForOrigin("LJU")).toContain("Austria");
  });

  it("falls back to hub country when unmapped", () => {
    const residents = targetResidentsForOrigin("ZNZ");
    expect(residents.length).toBeGreaterThan(0);
  });
});
