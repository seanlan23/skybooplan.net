import { describe, expect, it } from "vitest";
import {
  flightTripMaxBases,
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

describe("flightTripMaxBases", () => {
  it("caps 14–21 day flight trips at 4–6 hotel bases", () => {
    expect(flightTripMaxBases(9)).toBe(2);
    expect(flightTripMaxBases(13)).toBe(3);
    expect(flightTripMaxBases(14)).toBe(4);
    expect(flightTripMaxBases(16)).toBe(4);
    expect(flightTripMaxBases(18)).toBe(5);
    expect(flightTripMaxBases(21)).toBe(6);
  });
});

describe("motorhomeRoadTripMaxBases", () => {
  it("forces ≥2 nights per camp instead of one stop per day", () => {
    expect(motorhomeRoadTripMaxBases(2)).toBe(1);
    expect(motorhomeRoadTripMaxBases(3)).toBe(1);
    expect(motorhomeRoadTripMaxBases(4)).toBe(2);
  });

  it("caps mid/long trips to about one camp per two nights", () => {
    expect(motorhomeRoadTripMaxBases(7)).toBe(3);
    expect(motorhomeRoadTripMaxBases(11)).toBe(5);
    expect(motorhomeRoadTripMaxBases(14)).toBe(6);
    expect(motorhomeRoadTripMaxBases(21)).toBe(6);
  });
});

describe("motorhome system prompt bases", () => {
  it("asks for capped multi-night bases, not one stop per day", () => {
    const system = tripPlanSystemPrompt(motorhomeParams());
    expect(system).toMatch(/največ 5 bazami\/kampi/);
    expect(system).toMatch(/NATANKO 11 koledarskih day/);
    expect(system).toMatch(/PREPOVEDANO: ena baza na vsak dan/);
    expect(system).toMatch(/NAJMANJ 2 noči/);
    expect(system).toMatch(/1500–2200|CESTNI KROG|zadnja zmerna etapa/);
    expect(system).toMatch(/Število kampov ≠ število dni|kampov\/baz ≠ število dni/);
    expect(system).not.toMatch(/Ne združuj več dni v eno mesto/);
    expect(system).not.toMatch(/z 11 postajami vzdolž ceste/);
  });
});

describe("car road trip system prompt", () => {
  it("asks for hotels and forbids camp overnight rules", () => {
    const system = tripPlanSystemPrompt(
      motorhomeParams({
        groundTransportMode: "car",
        wishTags: ["sea", "avtodom"], // wishes must not flip car into motorhome
      }),
    );
    expect(system).toMatch(/AVTO \/ ROAD TRIP Z HOTELI|hotelskimi bazami/);
    expect(system).toMatch(/PREPOVEDANO[\s\S]*kamp/i);
    expect(system).not.toMatch(/bazami\/kampi/);
    expect(system).not.toMatch(/hotels MORA biti prazno/);
    expect(system).toMatch(/1500–2200|CESTNI KROG|zadnja zmerna etapa/);
  });
});
