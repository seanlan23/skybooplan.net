import { describe, expect, it } from "vitest";
import {
  destinationNameFromOgTitle,
  normalizeShareToken,
  planFromSharePayload,
  unquoteShareValue,
} from "@/lib/sharedPackageSnapshot";

describe("shared package snapshot helpers", () => {
  it("strips JSON-quoted tokens and hotel ids", () => {
    expect(unquoteShareValue('"1286043"')).toBe("1286043");
    expect(normalizeShareToken('"4c5f0x4j2442"')).toBe("4c5f0x4j2442");
  });

  it("keeps a thin saved row open as a single-base plan", () => {
    const plan = planFromSharePayload(
      { resortOffers: [{ id: "1286043", tier: "value", name: "Cape Kudu", hotelEur: 900, mealPlan: "breakfast" }] },
      {
        destinationName: destinationNameFromOgTitle(
          "Phuket, Tajska, Tajska – 14 dni oddiha z letom in hotelom že od 911 € / osebo",
        ),
        destinationIata: "HKT",
        originIata: "MXP",
        tripStyle: "single_base",
      },
    );
    expect(plan.destinationName).toMatch(/Phuket/);
    expect(plan.destinationIata).toBe("HKT");
    expect(plan.tripStyle).toBe("single_base");
    expect(plan.days).toEqual([]);
    expect(plan.resortOffers?.[0]?.id).toBe("1286043");
  });
});
