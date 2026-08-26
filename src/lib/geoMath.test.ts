import { describe, expect, it } from "vitest";
import { haversineKm, normalizeStatedRoadKm } from "@/lib/geoMath";
import { lookupRegionCoords } from "@/lib/regionCoords";

describe("normalizeStatedRoadKm", () => {
  it("treats metre values as km when they match the hop", () => {
    expect(normalizeStatedRoadKm(65_000, 65)).toBe(65);
  });

  it("replaces a continent-scale Cancun→Playa figure with geography", () => {
    const from = lookupRegionCoords("Cancun")!;
    const to = lookupRegionCoords("Playa del Carmen")!;
    const geo = haversineKm([from.lng, from.lat], [to.lng, to.lat]);
    expect(geo).toBeGreaterThan(50);
    expect(geo).toBeLessThan(90);
    const km = normalizeStatedRoadKm(4093, geo);
    expect(km).toBeGreaterThan(50);
    expect(km).toBeLessThan(120);
  });

  it("raises an understated Győr → Zagreb hop toward geography", () => {
    expect(normalizeStatedRoadKm(80, 250)).toBeGreaterThan(200);
  });
});
