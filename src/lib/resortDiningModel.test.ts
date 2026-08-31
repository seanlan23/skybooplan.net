import { describe, expect, it } from "vitest";
import {
  defaultResortHotelFilters,
  prefersAllInclusiveResortSearch,
  resolveResortDiningModel,
  resortDiningPromptRules,
  resortDiningSectionLabel,
  resortHotelSearchFilters,
} from "@/lib/resortDiningModel";

describe("resolveResortDiningModel", () => {
  it("uses breakfast-first for SE-Asia countries and IATA hubs", () => {
    expect(resolveResortDiningModel({ destinationIata: "HKT", destinationName: "Phuket" })).toBe(
      "breakfast_first",
    );
    expect(resolveResortDiningModel({ destinationPlace: "Bali, Indonezija" })).toBe("breakfast_first");
    expect(resolveResortDiningModel({ destinationIata: "SGN" })).toBe("breakfast_first");
    expect(resolveResortDiningModel({ destinationPlace: "Šrilanka" })).toBe("breakfast_first");
    expect(resolveResortDiningModel({ destinationIata: "MNL" })).toBe("breakfast_first");
  });

  it("uses all-inclusive where that is the prevailing resort model", () => {
    expect(resolveResortDiningModel({ destinationPlace: "Punta Cana" })).toBe(
      "all_inclusive_standard",
    );
    expect(resolveResortDiningModel({ destinationIata: "CUN" })).toBe("all_inclusive_standard");
    expect(resolveResortDiningModel({ destinationIata: "MLE" })).toBe("all_inclusive_standard");
    expect(resolveResortDiningModel({ destinationPlace: "Egipt" })).toBe("all_inclusive_standard");
    expect(resolveResortDiningModel({ destinationPlace: "Turčija" })).toBe("all_inclusive_standard");
    expect(resolveResortDiningModel({ destinationPlace: "Mavricij" })).toBe("all_inclusive_standard");
  });

  it("does not force a meal model for unspecified countries", () => {
    expect(resolveResortDiningModel({ destinationPlace: "Zanzibar" })).toBe("unspecified");
    expect(prefersAllInclusiveResortSearch("breakfast_first")).toBe(false);
    expect(prefersAllInclusiveResortSearch("all_inclusive_standard")).toBe(true);
    expect(defaultResortHotelFilters("breakfast_first")).toEqual({
      hotel: true,
      resortStay: true,
      stars345: true,
      minReview80: true,
      pool: true,
      breakfast: true,
    });
    expect(defaultResortHotelFilters("all_inclusive_standard")).toEqual({
      hotel: true,
      resortStay: true,
      stars345: true,
      minReview80: true,
      pool: true,
      allInclusive: true,
    });
    expect(defaultResortHotelFilters("unspecified")).toEqual({
      hotel: true,
      resortStay: true,
      stars345: true,
      minReview80: true,
      pool: true,
    });
    expect(resortHotelSearchFilters("all_inclusive_standard", { minStars: 4 }).stars45).toBe(true);
    expect(resortHotelSearchFilters("breakfast_first", { minStars: 3 }).stars45).toBeUndefined();
  });
});

describe("resort dining copy", () => {
  it("forbids wristbands in the Asia prompt and requires B&B wording", () => {
    const rules = resortDiningPromptRules("breakfast_first", "Phuket");
    expect(rules).toMatch(/STROGO PREPOVEDANO/);
    expect(rules).toMatch(/nočitev z zajtrkom/i);
    expect(rules).toMatch(/nočne tržnice/);
    expect(rules).not.toMatch(/zapestnice, bufete/);
  });

  it("allows wristband etiquette only for all-inclusive regions", () => {
    const rules = resortDiningPromptRules("all_inclusive_standard", "Punta Cana");
    expect(rules).toMatch(/zapestnice/);
    expect(rules).toMatch(/Karibi/);
  });

  it("picks the section title from the dining model", () => {
    expect(resortDiningSectionLabel("breakfast_first", "sl")).toMatch(/Nočitev z zajtrkom/);
    expect(resortDiningSectionLabel("all_inclusive_standard", "sl")).toMatch(/All-inclusive bonton/);
  });
});
