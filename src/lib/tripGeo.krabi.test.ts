import { describe, expect, it } from "vitest";
import { lookupPoiCoords } from "@/lib/tripGeo";
import { resolveActivityCoordinates } from "@/lib/mapPoiResolver";
import type { DayPlan } from "@/lib/aiPlan.functions";

describe("Krabi land POI coords", () => {
  it("places Phra Nang on the Railay peninsula, not offshore", () => {
    const c = lookupPoiCoords("Phra Nang Cave Beach");
    expect(c).toBeTruthy();
    // Beach tip is east of 98.83, south of Railay village
    expect(c!.lng).toBeGreaterThan(98.83);
    expect(c!.lat).toBeGreaterThan(8.0);
    expect(c!.lat).toBeLessThan(8.02);
  });

  it("snaps national-park bbox centers to Hat Noppharat Thara beach", () => {
    const c = lookupPoiCoords("Hat Noppharat Thara-Mu Ko Phi Phi National Park");
    expect(c).toBeTruthy();
    expect(c!.lng).toBeLessThan(98.85);
    expect(c!.lat).toBeGreaterThan(8.03);
  });

  it("overrides Gemini offshore coords via resolveActivityCoordinates", () => {
    const day = {
      day: 6,
      city: "Krabi",
      lat: 8.086,
      lng: 98.906,
      mapPins: [],
    } as unknown as DayPlan;
    const resolved = resolveActivityCoordinates(
      {
        name: "Phra Nang Cave Beach",
        // Deliberately wrong — middle of Andaman Sea
        lat: 7.95,
        lng: 98.78,
      },
      day,
    );
    expect(resolved?.lat).toBeCloseTo(8.0056, 3);
    expect(resolved?.lng).toBeCloseTo(98.8403, 3);
  });
});
