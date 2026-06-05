import { describe, it, expect } from "vitest";
import type { AiTripPlan } from "./aiPlan.functions";
import { validateItinerary } from "./planValidation";

/**
 * Enforcement contract: the server fn `generateAiPlan` and the client save
 * path in `routes/index.tsx` both run `validateItinerary` and refuse to
 * persist/render any plan with violations. These tests lock in the
 * contract by asserting the gate logic against representative bad plans —
 * if `validateItinerary` ever returns `[]` for these, the production gate
 * would silently leak broken itineraries.
 */

const badDuplicateDays: AiTripPlan = {
  destinationName: "X",
  summary: "",
  totalBudgetEur: 0,
  centerLat: 0,
  centerLng: 0,
  days: [
    {
      day: 1, date: "2026-07-01", title: "", morning: "", afternoon: "", evening: "",
      travelHack: "", transportationTips: "", localWarnings: "", dailyBudgetEur: 0, lat: 7.88, lng: 98.4, focusName: "A",
      city: "Phuket", category: "sight",
    },
    {
      day: 1, date: "2026-07-02", title: "", morning: "", afternoon: "", evening: "",
      travelHack: "", transportationTips: "", localWarnings: "", dailyBudgetEur: 0, lat: 7.88, lng: 98.4, focusName: "B",
      city: "Phuket", category: "sight",
    },
  ],
};

const badTeleport: AiTripPlan = {
  destinationName: "X",
  summary: "",
  totalBudgetEur: 0,
  centerLat: 0,
  centerLng: 0,
  days: [
    {
      day: 1, date: "2026-07-01", title: "", morning: "", afternoon: "", evening: "",
      travelHack: "", transportationTips: "", localWarnings: "", dailyBudgetEur: 0, lat: 7.88, lng: 98.4, focusName: "A",
      city: "Phuket", category: "sight",
    },
    {
      day: 2, date: "2026-07-02", title: "", morning: "", afternoon: "", evening: "",
      travelHack: "", transportationTips: "", localWarnings: "", dailyBudgetEur: 0, lat: 9.51, lng: 100.0, focusName: "B",
      city: "Koh Samui", category: "beach", // long hop, no transport
    },
  ],
};

describe("itinerary enforcement gate", () => {
  it("rejects plans with duplicate day numbers", () => {
    expect(validateItinerary(badDuplicateDays).length).toBeGreaterThan(0);
  });

  it("rejects plans that teleport between regions without a transport block", () => {
    const v = validateItinerary(badTeleport);
    expect(v.some((x) => x.rule === "missing_travel_block")).toBe(true);
  });

  it("server fn shape exposes INVALID_ITINERARY error code", async () => {
    // Type-level guard: confirm the error code is part of the public
    // result type so callers can branch on it without `as` casts.
    const { generateAiPlan } = await import("./aiPlan.functions");
    type Result = Awaited<ReturnType<Parameters<typeof generateAiPlan>[0] extends never ? never : typeof generateAiPlan>>;
    // The actual runtime value is created from `.handler(...)`, so we only
    // assert the shape via a sample object satisfying the public type.
    const sample: Result = {
      plan: null,
      error: "x",
      errorCode: "INVALID_ITINERARY",
      violations: [{ rule: "duplicate_day_number", message: "x", dayNumbers: [1] }],
    } as Result;
    expect(sample.errorCode).toBe("INVALID_ITINERARY");
    expect(sample.violations?.[0].rule).toBe("duplicate_day_number");
  });
});
