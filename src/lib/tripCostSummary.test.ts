import { describe, expect, it } from "vitest";
import {
  buildTripCostSummary,
  heroFlightPartyTotalEur,
  itineraryWithTripCosts,
  stampFlightTotalOnPlan,
  summarizeAiTripCosts,
} from "@/lib/tripCostSummary";
import type { AiTripPlan } from "@/lib/aiPlan.functions";

const stubPlan = (over: Partial<AiTripPlan> = {}): AiTripPlan => ({
  destinationName: "Bangkok",
  summary: "",
  totalBudgetEur: 1000,
  centerLat: 0,
  centerLng: 0,
  days: [
    {
      day: 1,
      date: "2026-07-24",
      city: "Bangkok",
      title: "Arrival",
      morning: "",
      afternoon: "",
      evening: "",
      travelHack: "",
      transportationTips: "",
      localWarnings: "",
      lat: 0,
      lng: 0,
      dailyBudgetEur: 50,
      category: "activity",
    },
  ],
  ...over,
});

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

  it("hero per-person × party; party_total stays as-is", () => {
    expect(heroFlightPartyTotalEur(1437, 2)).toBe(2874);
    expect(heroFlightPartyTotalEur(1564, 2, "party_total")).toBe(1564);
    expect(heroFlightPartyTotalEur(1437, 3)).toBe(4311);
  });

  it("summarizeAiTripCosts uses stamped tickets for the grand total", () => {
    const s = summarizeAiTripCosts(stubPlan({ flightTotalEur: 2874 }), { pax: 2 });
    expect(s.planEur).toBe(1000);
    expect(s.flightEur).toBe(2874);
    expect(s.grandTotalEur).toBe(3874);
  });

  it("itinerary overlay keeps destination vs ticket split", () => {
    const plan = stubPlan({ flightTotalEur: 2874 });
    const cost = summarizeAiTripCosts(plan, { pax: 2 });
    const overlay = itineraryWithTripCosts(plan, cost);
    expect(overlay.planEur).toBe(1000);
    expect(overlay.flightEur).toBe(2874);
    expect(overlay.totalBudgetEur).toBe(3874);
    expect(overlay.flightTotalEur).toBe(2874);
  });

  it("stampFlightTotalOnPlan skips motorhome", () => {
    const stamped = stampFlightTotalOnPlan(
      stubPlan({ groundTransportMode: "motorhome" }),
      2000,
    );
    expect(stamped.flightTotalEur).toBeUndefined();
  });
});
