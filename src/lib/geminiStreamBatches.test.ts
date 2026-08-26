import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  nextIncompleteDayRange,
  streamBatchSize,
  streamBatchSizeWithTimeLeft,
} from "@/lib/geminiPro.functions";
import {
  alignBatchDays,
  contiguousCoveredDays,
  mergeStreamedTripPlans,
  planVisitedCities,
  streamBatchShouldCut,
  streamBatchWindowReady,
  streamPartialPastItinerary,
} from "@/lib/geminiStreamBatches";
import { thisResponseDaySpan } from "@/lib/geminiPro.shared";

function day(partial: Partial<DayPlan> & { day: number }): DayPlan {
  return {
    title: `Day ${partial.day}`,
    city: partial.city ?? "Phuket",
    lat: partial.lat ?? 7.88,
    lng: partial.lng ?? 98.39,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 55,
    ...partial,
  } as DayPlan;
}

function plan(days: DayPlan[], name = "Phuket"): AiTripPlan {
  return {
    destinationName: name,
    summary: name,
    totalBudgetEur: days.reduce((s, d) => s + (d.dailyBudgetEur ?? 0), 0),
    centerLat: 7.88,
    centerLng: 98.39,
    days,
  };
}

describe("stream day batches", () => {
  it("keeps 8-day trips in one Gemini call", () => {
    expect(streamBatchSize(8)).toBe(8);
    expect(nextIncompleteDayRange(0, 8)).toEqual({ start: 1, end: 8 });
    expect(nextIncompleteDayRange(8, 8)).toBeNull();
  });

  it("splits a 13–16 day trip into 4-day windows so one 280s call is not the whole itinerary", () => {
    expect(streamBatchSize(10)).toBe(4);
    expect(streamBatchSize(13)).toBe(4);
    expect(streamBatchSize(16)).toBe(4);
    expect(nextIncompleteDayRange(0, 13)).toEqual({ start: 1, end: 4 });
    expect(nextIncompleteDayRange(4, 13)).toEqual({ start: 5, end: 8 });
    expect(nextIncompleteDayRange(6, 13)).toEqual({ start: 7, end: 10 });
    expect(nextIncompleteDayRange(0, 16)).toEqual({ start: 1, end: 4 });
    expect(nextIncompleteDayRange(4, 16)).toEqual({ start: 5, end: 8 });
    expect(nextIncompleteDayRange(8, 16)).toEqual({ start: 9, end: 12 });
    expect(nextIncompleteDayRange(12, 16)).toEqual({ start: 13, end: 16 });
    expect(nextIncompleteDayRange(16, 16)).toBeNull();
  });

  it("continues from a 2-day stub instead of shipping 2/16", () => {
    expect(nextIncompleteDayRange(2, 16)).toEqual({ start: 3, end: 6 });
  });

  it("does not treat a premature day 15 as full coverage of a 15-day trip", () => {
    expect(contiguousCoveredDays([{ day: 1 }, { day: 2 }, { day: 3 }, { day: 15 }])).toBe(3);
    expect(
      nextIncompleteDayRange(
        contiguousCoveredDays([{ day: 1 }, { day: 2 }, { day: 3 }, { day: 15 }]),
        15,
      ),
    ).toEqual({ start: 4, end: 7 });
  });

  it("shrinks the window when the hard cap would otherwise skip the rest", () => {
    expect(streamBatchSizeWithTimeLeft(16, 0, 280_000)).toBe(4);
    expect(streamBatchSizeWithTimeLeft(16, 200_000, 280_000)).toBe(3);
    expect(streamBatchSizeWithTimeLeft(8, 200_000, 280_000)).toBe(3);
  });
});

describe("streamBatchWindowReady", () => {
  it("waits until the last day in the window has body, then is ready", () => {
    const range = { start: 1, end: 6 };
    expect(
      streamBatchWindowReady(
        [1, 2, 3, 4, 5, 6].map((n) => day({ day: n })),
        range,
      ),
    ).toBe(false);
    expect(
      streamBatchWindowReady(
        [1, 2, 3, 4, 5, 6].map((n) =>
          day({ day: n, morning: n === 6 ? "Mercado" : "Sprehod" }),
        ),
        range,
      ),
    ).toBe(true);
  });

  it("treats hotels/logistics as the leftover mill after days are done", () => {
    expect(streamPartialPastItinerary({ itinerar: [] })).toBe(false);
    expect(streamPartialPastItinerary({ logistics_and_tips: { finance: "x" } })).toBe(
      true,
    );
    expect(streamPartialPastItinerary({ hotels: [{ name: "X" }] })).toBe(true);
  });

  it("does not cut days 1–4 because Gemini already wrote day 15", () => {
    const range = { start: 1, end: 4 };
    const stub = [1, 2, 3].map((n) =>
      day({ day: n, morning: "Ogled", afternoon: "Kosilo", evening: "Večerja" }),
    );
    expect(
      streamBatchShouldCut(stub, range, { hotels: [{ name: "X" }], itinerar: stub }),
    ).toBe(false);
    const full = [1, 2, 3, 4].map((n) =>
      day({ day: n, morning: "Ogled", afternoon: "Kosilo", evening: "Večerja" }),
    );
    expect(streamBatchShouldCut(full, range, { hotels: [{ name: "X" }] })).toBe(true);
  });
});

describe("alignBatchDays", () => {
  it("keeps day_numbers already in the requested window", () => {
    const aligned = alignBatchDays(
      plan([day({ day: 7, city: "Khao Sok" }), day({ day: 8, city: "Ao Nang" })]),
      { start: 7, end: 12 },
    );
    expect(aligned.days.map((d) => d.day)).toEqual([7, 8]);
  });

  it("shifts a restarted 1-based batch onto the continuation window", () => {
    const aligned = alignBatchDays(
      plan([day({ day: 1, city: "Kuala Lumpur" }), day({ day: 2, city: "Kuala Lumpur" })]),
      { start: 9, end: 14 },
    );
    expect(aligned.days.map((d) => ({ day: d.day, city: d.city }))).toEqual([
      { day: 9, city: "Kuala Lumpur" },
      { day: 10, city: "Kuala Lumpur" },
    ]);
  });
});

describe("mergeStreamedTripPlans", () => {
  it("unions Phuket days with later Kuala Lumpur days", () => {
    const first = plan([day({ day: 1 }), day({ day: 2 })], "Phuket");
    const second = plan(
      [day({ day: 9, city: "Kuala Lumpur" }), day({ day: 10, city: "Kuala Lumpur" })],
      "Tajska in Kuala Lumpur",
    );
    const merged = mergeStreamedTripPlans(first, second, 3);
    expect(merged.days.map((d) => d.city)).toEqual([
      "Phuket",
      "Phuket",
      "Kuala Lumpur",
      "Kuala Lumpur",
    ]);
    expect(merged.destinationName).toBe("Tajska in Kuala Lumpur");
    expect(planVisitedCities(merged)).toEqual(["Phuket", "Kuala Lumpur"]);
  });
});

describe("thisResponseDaySpan", () => {
  it("marks a mid-trip window as continuation without arrival or departure", () => {
    const span = thisResponseDaySpan({ days: 16, dayRange: { start: 7, end: 12 } });
    expect(span).toMatchObject({
      count: 6,
      isPartial: true,
      includesArrival: false,
      includesDeparture: false,
    });
  });
});
