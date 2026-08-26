import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  attachKnownTravelLegs,
  logisticsRepairPrompt,
  mergeRepairedDays,
} from "@/lib/routeRepair";

const day = (overrides: Partial<DayPlan>): DayPlan => ({
  day: 1,
  date: "2026-07-01",
  title: "Day",
  morning: "",
  afternoon: "",
  evening: "",
  travelHack: "",
  transportationTips: "",
  localWarnings: "",
  dailyBudgetEur: 100,
  lat: 0,
  lng: 0,
  focusName: "",
  city: "",
  category: "sight",
  ...overrides,
});

const plan = (days: DayPlan[]): AiTripPlan => ({
  destinationName: "Test",
  summary: "",
  totalBudgetEur: 0,
  centerLat: days[0]?.lat ?? 0,
  centerLng: days[0]?.lng ?? 0,
  days,
});

describe("logisticsRepairPrompt", () => {
  it("includes violation messages and no locked Bangkok calendar", () => {
    const { system, user } = logisticsRepairPrompt(
      [
        {
          rule: "thin_long_access",
          message: "Koh Lipe has 2 hotel nights (need ≥4).",
          dayNumbers: [13, 14],
        },
        {
          rule: "missing_travel_block",
          message: "Day 8 → 9: 280km hop without a transport block",
          dayNumbers: [8, 9],
        },
      ],
      "sl",
    );
    expect(user).toMatch(/Koh Lipe has 2 hotel nights/);
    expect(user).toMatch(/280km hop/);
    expect(system).not.toMatch(/Dan 1–3: Bangkok|KURIRANA POT|SMSEL POTI/i);
  });
});

describe("attachKnownTravelLegs", () => {
  it("adds a catalog hop without changing cities", () => {
    const p = plan([
      day({ day: 8, city: "Krabi", lat: 8.05, lng: 98.92 }),
      day({ day: 9, city: "Koh Lipe", lat: 6.49, lng: 99.3 }),
    ]);
    expect(attachKnownTravelLegs(p)).toBe(1);
    expect(p.days[0]!.city).toBe("Krabi");
    expect(p.days[1]!.city).toBe("Koh Lipe");
    expect(p.days[1]!.transportation?.[0]).toMatchObject({
      from: "Krabi",
      to: "Koh Lipe",
    });
  });
});

describe("mergeRepairedDays", () => {
  it("relabels only returned days", () => {
    const p = plan([
      day({ day: 1, city: "Krabi", title: "Krabi" }),
      day({ day: 2, city: "Koh Lipe", title: "Lipe" }),
    ]);
    const n = mergeRepairedDays(p, [
      { day: 2, city: "Phuket", title: "Phuket — nova baza" },
    ]);
    expect(n).toBe(1);
    expect(p.days[0]!.city).toBe("Krabi");
    expect(p.days[1]!.city).toBe("Phuket");
    expect(p.days[1]!.title).toMatch(/Phuket/);
  });
});
