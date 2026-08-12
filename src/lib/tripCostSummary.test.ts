import { describe, expect, it } from "vitest";
import { buildTripCostSummary, heroFlightPartyTotalEur } from "@/lib/tripCostSummary";

describe("buildTripCostSummary", () => {
  it("adds selected flights into the main total", () => {
    const s = buildTripCostSummary({
      planEur: 1000,
      flightTotalEur: 2874,
      dayCount: 15,
      pax: 2,
      countryCode: "TH",
      mode: "hotel",
    });
    expect(s.grandTotalEur).toBe(3874);
    expect(s.flightEur).toBe(2874);
    expect(s.overnight.totalEur).toBe(55 * 14);
  });

  it("hero per-adult × adults; party_total stays as-is", () => {
    expect(heroFlightPartyTotalEur(1437, 2)).toBe(2874);
    expect(heroFlightPartyTotalEur(1564, 2, "party_total")).toBe(1564);
  });
});
