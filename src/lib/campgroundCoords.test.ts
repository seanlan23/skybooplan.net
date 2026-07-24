import { describe, expect, it } from "vitest";
import {
  defaultCampgroundNearCity,
  resolveCampgroundCoords,
} from "@/lib/campgroundCoords";

describe("campgroundCoords", () => {
  it("resolves named camps near Vienna", () => {
    const hit = resolveCampgroundCoords("Vienna", "Camping Wien West");
    expect(hit).toMatchObject({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(hit!.lat).toBeCloseTo(48.205, 2);
  });

  it("falls back to city default when camp is generic", () => {
    const hit = resolveCampgroundCoords("Ljubljana", "Campground overnight");
    expect(hit?.matchedName).toMatch(/ljubljana/i);
  });

  it("defaultCampgroundNearCity returns curated hub", () => {
    expect(defaultCampgroundNearCity("Split")?.name).toMatch(/stobre/i);
  });

  it("returns null for unknown cities", () => {
    expect(resolveCampgroundCoords("Atlantis", "Camp X")).toBeNull();
    expect(defaultCampgroundNearCity("Atlantis")).toBeNull();
  });
});
