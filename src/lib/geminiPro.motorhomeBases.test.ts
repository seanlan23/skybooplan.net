import { describe, expect, it } from "vitest";
import {
  motorhomeRoadTripMaxBases,
  tripPlanSystemPrompt,
} from "@/lib/geminiPro";
import type { GenerateTripPlanParams } from "@/lib/geminiPro.shared";

function motorhomeParams(
  overrides?: Partial<GenerateTripPlanParams>,
): GenerateTripPlanParams {
  return {
    originIata: "VIE",
    destinationIata: "ZAG",
    originPlace: "Vienna",
    destinationPlace: "Croatia",
    destination: "Croatia",
    month: "avgust",
    days: 11,
    departDate: "2026-08-14",
    returnDate: "2026-08-24",
    pax: { adults: 2, childrenAges: [] },
    budget: "standard",
    wishTags: ["sea", "nature"],
    pace: "relaxed",
    groundTransportMode: "motorhome",
    language: "sl",
    currency: "EUR",
    ...overrides,
  };
}

describe("motorhomeRoadTripMaxBases", () => {
  it("keeps short trips 1:1", () => {
    expect(motorhomeRoadTripMaxBases(3)).toBe(3);
    expect(motorhomeRoadTripMaxBases(4)).toBe(4);
  });

  it("caps mid/long trips so JSON fits output budget", () => {
    expect(motorhomeRoadTripMaxBases(7)).toBe(4);
    expect(motorhomeRoadTripMaxBases(11)).toBe(6);
    expect(motorhomeRoadTripMaxBases(14)).toBe(7);
  });
});

describe("motorhome system prompt bases", () => {
  it("asks for capped multi-night bases, not one stop per day", () => {
    const system = tripPlanSystemPrompt(motorhomeParams());
    expect(system).toMatch(/največ 6 bazami\/kampi/);
    expect(system).toMatch(/NATANKO 11 koledarskih day/);
    expect(system).toMatch(/PREPOVEDANO: ena baza na vsak dan/);
    expect(system).toMatch(/Število kampov ≠ število dni|kampov\/baz ≠ število dni/);
    expect(system).not.toMatch(/Ne združuj več dni v eno mesto/);
    expect(system).not.toMatch(/z 11 postajami vzdolž ceste/);
  });
});
