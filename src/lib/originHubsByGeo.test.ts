import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORIGIN_IATAS,
  rankOriginIatasByDistance,
  resolveOriginHubsForGeo,
} from "@/lib/originHubsByGeo";

describe("resolveOriginHubsForGeo", () => {
  it("returns German hubs for DE", () => {
    const hubs = resolveOriginHubsForGeo({ country: "DE" });
    expect(hubs).toEqual(expect.arrayContaining(["MUC", "FRA", "HAM"]));
    expect(hubs[0]).toMatch(/MUC|FRA|HAM|BER|DUS|CGN/);
    expect(hubs).toHaveLength(6);
  });

  it("returns Slovenian-region hubs for SI", () => {
    const hubs = resolveOriginHubsForGeo({ country: "SI" });
    expect(hubs).toContain("LJU");
    expect(hubs[0]).toBe("LJU");
  });

  it("falls back to CE defaults when country unknown", () => {
    const hubs = resolveOriginHubsForGeo({ country: null });
    expect(hubs).toEqual([...DEFAULT_ORIGIN_IATAS]);
  });

  it("re-ranks DE hubs nearer to Hamburg IP coords", () => {
    // Hamburg ~ 53.55, 9.99
    const hubs = resolveOriginHubsForGeo({
      country: "DE",
      lat: 53.55,
      lng: 9.99,
    });
    expect(hubs[0]).toBe("HAM");
  });
});

describe("rankOriginIatasByDistance", () => {
  it("puts Vienna first when near Vienna", () => {
    const ranked = rankOriginIatasByDistance(
      ["LJU", "VIE", "MUC"],
      48.2,
      16.37,
    );
    expect(ranked[0]).toBe("VIE");
  });
});
