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
    expect(s.stayInTotal).toBe(false);
  });

  it("puts flight + stay estimate in SKUPAJ for a resort stay", () => {
    const s = buildTripCostSummary({
      planEur: 0,
      flightTotalEur: 1162,
      dayCount: 1,
      pax: 2,
      countryCode: "TH",
      mode: "hotel",
      nights: 11,
      stayInTotal: true,
    });
    expect(s.overnight.totalEur).toBe(605);
    expect(s.grandTotalEur).toBe(1767);
    expect(s.stayInTotal).toBe(true);
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

  it("single_base uses hotel nights, not the synthetic 1-day plan", () => {
    const s = summarizeAiTripCosts(
      stubPlan({
        tripStyle: "single_base",
        totalBudgetEur: 0,
        flightTotalEur: 1800,
        hotels: [{ city: "Nungwi", nights: 6, from_date: "2026-09-20", to_date: "2026-09-26" }],
        destinationName: "Zanzibar",
        destinationIata: "ZNZ",
      }),
      { pax: 2, flightTotalEur: 1800, destinationIata: "ZNZ" },
    );
    expect(s.flightEur).toBe(1800);
    expect(s.overnight.nights).toBe(6);
    expect(s.overnight.totalEur).toBeGreaterThan(0);
    expect(s.grandTotalEur).toBe(1800 + s.overnight.totalEur);
    expect(s.stayInTotal).toBe(true);
  });

  it("counts resort nights from destination arrival, not home-airport depart", () => {
    const s = summarizeAiTripCosts(
      stubPlan({
        tripStyle: "single_base",
        totalBudgetEur: 0,
        hotels: [{ city: "Phuket", nights: 11, from_date: "2026-10-26", to_date: "2026-11-06" }],
        destinationName: "Phuket",
        destinationIata: "HKT",
      }),
      {
        pax: 2,
        destinationIata: "HKT",
        departDate: "2026-10-26",
        returnDate: "2026-11-06",
        flights: {
          outboundDepart: "19:40",
          outboundArrive: "10:10",
          outboundArriveDayOffset: 1,
        },
      },
    );
    expect(s.overnight.nights).toBe(10);
  });

  it("stampFlightTotalOnPlan skips motorhome", () => {
    const stamped = stampFlightTotalOnPlan(
      stubPlan({ groundTransportMode: "motorhome" }),
      2000,
    );
    expect(stamped.flightTotalEur).toBeUndefined();
  });
});
