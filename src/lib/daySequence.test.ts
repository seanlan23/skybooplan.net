import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  expandPlanDaysToExpected,
  hasContiguousDayNumbers,
  repairPlanDaySequence,
  resyncPlanDayDates,
} from "@/lib/daySequence";

function day(partial: Partial<DayPlan> & { day: number }): DayPlan {
  return {
    title: `Day ${partial.day}`,
    city: partial.city ?? "Bangkok",
    lat: partial.lat ?? 13.75,
    lng: partial.lng ?? 100.5,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 80,
    ...partial,
  } as DayPlan;
}

describe("repairPlanDaySequence", () => {
  it("does not invent a placeholder for a missing day number", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({ day: 1, city: "Bangkok" }),
        day({ day: 2, city: "Bangkok" }),
        day({ day: 3, city: "Ayutthaya" }),
        day({ day: 4, city: "Ayutthaya" }),
        day({ day: 6, city: "Chiang Mai" }),
        day({ day: 7, city: "Chiang Mai" }),
      ],
    } as AiTripPlan;

    const { inserted } = repairPlanDaySequence(plan, { language: "sl" });
    expect(inserted).toEqual([]);
    expect(plan.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 6, 7]);
  });
});

describe("expandPlanDaysToExpected", () => {
  it("does not invent extra motorhome days when Gemini under-emits", () => {
    const plan = {
      destinationName: "Italy",
      groundTransportMode: "motorhome",
      accommodationMode: "motorhome",
      days: [
        day({ day: 1, city: "Vienna", date: "2026-08-01" }),
        day({ day: 2, city: "Venice", date: "2026-08-02" }),
        day({ day: 3, city: "Venice", date: "2026-08-03" }),
        day({ day: 4, city: "Florence", date: "2026-08-04" }),
        day({ day: 5, city: "Rome", date: "2026-08-05" }),
        day({ day: 6, city: "Rome", date: "2026-08-06" }),
      ],
    } as AiTripPlan;

    const { inserted } = expandPlanDaysToExpected(plan, {
      expectedDays: 10,
      language: "sl",
      departDate: "2026-08-01",
    });

    expect(inserted).toEqual([]);
    expect(plan.days).toHaveLength(6);
    expect(JSON.stringify(plan)).not.toMatch(/prosti \/ lokalni dan/i);
  });

  it("does not pad a hotel stream stub with empty calendar fillers", () => {
    const plan = {
      destinationName: "France",
      contentLanguage: "sl",
      days: [
        day({ day: 1, city: "Paris", date: "2026-08-01" }),
        day({ day: 2, city: "Paris", date: "2026-08-02" }),
        day({ day: 3, city: "Blois", date: "2026-08-03" }),
      ],
    } as AiTripPlan;

    expandPlanDaysToExpected(plan, {
      expectedDays: 15,
      language: "sl",
      departDate: "2026-08-01",
    });

    expect(plan.days).toHaveLength(3);
    const blob = JSON.stringify(plan);
    expect(blob).not.toMatch(/prosti \/ lokalni dan/i);
    expect(blob).not.toMatch(/Popoldanski lokalni ogled/i);
    expect(blob).not.toMatch(/Popoldanski ogled v mestu/i);
  });

  it("does not pad car days with invented calendar fillers", () => {
    const plan = {
      destinationName: "Spain",
      groundTransportMode: "car",
      accommodationMode: "hotel",
      days: [
        day({ day: 1, city: "Ljubljana", date: "2026-07-01" }),
        day({ day: 2, city: "Barcelona", date: "2026-07-02" }),
      ],
    } as AiTripPlan;

    expandPlanDaysToExpected(plan, {
      expectedDays: 4,
      language: "sl",
      departDate: "2026-07-01",
    });

    expect(plan.days).toHaveLength(2);
  });

  it("does not clone identical activity trees when padding stay nights", () => {
    const plan = {
      destinationName: "Panama",
      days: [
        day({
          day: 1,
          city: "Panama City",
          date: "2026-08-01",
          activities: {
            morning: [
              { name: "Casco Viejo", type: "SIGHT", description: "Staro jedro." },
            ],
            afternoon: [
              { name: "Miraflores Locks", type: "SIGHT", description: "Prekop." },
            ],
            evening: [
              { name: "Večerja v Casco", type: "EAT", description: "Večerja." },
            ],
          },
        }),
      ],
    } as AiTripPlan;

    expandPlanDaysToExpected(plan, {
      expectedDays: 3,
      language: "sl",
      departDate: "2026-08-01",
    });

    expect(plan.days).toHaveLength(1);
    expect(String(plan.days[0]?.activities?.morning?.[0]?.name ?? "")).toMatch(/Casco/i);
    expect(JSON.stringify(plan)).not.toMatch(/prosti \/ lokalni dan/i);
  });

  it("trims extra days so the calendar is exactly N", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({ day: 1, city: "Bangkok", date: "2026-10-26" }),
        day({ day: 2, city: "Bangkok", date: "2026-10-27" }),
        day({ day: 3, city: "Phuket", date: "2026-10-28" }),
        day({ day: 4, city: "Phuket", date: "2026-10-29" }),
        day({ day: 5, city: "Phuket", date: "2026-10-30" }),
      ],
    } as AiTripPlan;

    expandPlanDaysToExpected(plan, {
      expectedDays: 4,
      language: "sl",
      departDate: "2026-10-26",
    });

    expect(plan.days).toHaveLength(4);
    expect(plan.days.map((d) => d.day)).toEqual([1, 2, 3, 4]);
  });
});

describe("hasContiguousDayNumbers", () => {
  it("treats dayEnd spans as covered", () => {
    expect(
      hasContiguousDayNumbers([
        { day: 1 },
        { day: 2 },
        { day: 3, dayEnd: 4 },
        { day: 5 },
      ]),
    ).toBe(true);
  });

  it("detects a bare gap", () => {
    expect(hasContiguousDayNumbers([{ day: 1 }, { day: 2 }, { day: 4 }])).toBe(false);
  });
});

describe("resyncPlanDayDates", () => {
  it("stamps consecutive ISO dates from departDate even when Gemini duplicated a day", () => {
    const plan = {
      destinationName: "Thailand",
      days: [
        day({ day: 1, city: "Bangkok", date: "2026-10-26" }),
        day({ day: 6, city: "Ayutthaya", date: "2026-10-31" }),
        day({ day: 7, city: "Chiang Mai", date: "2026-10-31" }),
        day({ day: 12, city: "Krabi", date: "2026-11-05" }),
        day({ day: 13, city: "Koh Lipe", date: "2026-11-07" }),
      ],
    } as AiTripPlan;

    expect(resyncPlanDayDates(plan, "2026-10-26")).toBeGreaterThan(0);
    expect(plan.days.find((d) => d.day === 6)?.date).toBe("2026-10-31");
    expect(plan.days.find((d) => d.day === 7)?.date).toBe("2026-11-01");
    expect(plan.days.find((d) => d.day === 12)?.date).toBe("2026-11-06");
    expect(plan.days.find((d) => d.day === 13)?.date).toBe("2026-11-07");
  });
});
