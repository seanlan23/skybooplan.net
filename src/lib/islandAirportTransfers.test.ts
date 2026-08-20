import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  detectIslandAccessTransition,
  enrichIslandAirportTransfers,
  getIslandAirportAccessDef,
} from "@/lib/islandAirportTransfers";

function day(partial: Partial<DayPlan> & Pick<DayPlan, "day" | "city">): DayPlan {
  return {
    date: "2026-08-01",
    title: partial.city,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 50,
    lat: partial.lat ?? 0,
    lng: partial.lng ?? 0,
    focusName: partial.city,
    ...partial,
  } as DayPlan;
}

describe("islandAirportTransfers", () => {
  it("matches Boracay by city or MPH gateway when city is unset", () => {
    expect(getIslandAirportAccessDef("Boracay")?.id).toBe("boracay");
    expect(getIslandAirportAccessDef("", "MPH")?.id).toBe("boracay");
    expect(getIslandAirportAccessDef("Manila", "MPH")).toBeNull();
  });

  it("replaces single flight to Boracay with 3-step transfer", () => {
    const plan: AiTripPlan = {
      destinationName: "Philippines",
      destinationIata: "MPH",
      days: [
        day({ day: 1, city: "Manila", lat: 14.599, lng: 120.984 }),
        day({
          day: 2,
          city: "Boracay",
          lat: 11.9,
          lng: 121.9,
          transportation: [
            {
              type: "flight",
              from: "Manila",
              to: "Boracay",
              duration: "1h 15m",
              estimatedPrice: 50,
            },
          ],
        }),
      ],
    } as AiTripPlan;

    enrichIslandAirportTransfers(plan, { destinationIata: "MPH" });

    const boracay = plan.days[1]!;
    expect(boracay.transportation).toHaveLength(3);
    expect(boracay.transportation!.map((l) => l.type)).toEqual(["flight", "van", "ferry"]);
    expect(boracay.transportation![0]!.to).toMatch(/Caticlan|MPH/i);
    expect(boracay.transportation![2]!.to).toBe("Boracay");
    expect(boracay.islandAccessRoute).toEqual({ defId: "boracay", direction: "arrival" });
    expect(boracay.lat).toBeCloseTo(11.9674, 2);
  });

  it("detects Manila → Boracay map transition", () => {
    const prev = day({ day: 1, city: "Manila", lat: 14.599, lng: 120.984 });
    const curr = day({ day: 2, city: "Boracay", lat: 11.9674, lng: 121.9248 });
    const t = detectIslandAccessTransition(prev, curr, "MPH");
    expect(t?.direction).toBe("arrival");
    expect(t?.def.id).toBe("boracay");
  });

  it("builds Koh Lipe → Phuket departure via Pak Bara + HDY", () => {
    expect(getIslandAirportAccessDef("Koh Lipe")?.id).toBe("koh-lipe");

    const plan: AiTripPlan = {
      destinationName: "Thailand",
      destinationIata: "HKT",
      days: [
        day({ day: 10, city: "Koh Lipe", lat: 6.48, lng: 99.31 }),
        day({ day: 11, city: "Phuket", lat: 7.88, lng: 98.39 }),
      ],
    } as AiTripPlan;

    enrichIslandAirportTransfers(plan, { destinationIata: "HKT" });

    const lipe = plan.days[0]!;
    const phuket = plan.days[1]!;
    expect(lipe.transportation ?? []).toHaveLength(0);
    expect(phuket.transportation).toHaveLength(3);
    expect(phuket.transportation!.map((l) => l.type)).toEqual(["ferry", "van", "flight"]);
    expect(phuket.transportation![0]!.to).toMatch(/Pak Bara/i);
    expect(phuket.transportation![1]!.to).toMatch(/Hat Yai|HDY/i);
    expect(phuket.transportation![2]!.to).toMatch(/Phuket/i);
    expect(phuket.islandAccessRoute).toEqual({ defId: "koh-lipe", direction: "departure" });
    expect(phuket.transportationTips).toMatch(/Phuket/i);
    expect(phuket.transportationTips).not.toMatch(/HKT/i);
  });

  it("rewrites Krabi Klong Jilad ferry copy to van + Pak Bara, not a Hat Yai flight", () => {
    const plan: AiTripPlan = {
      destinationName: "Thailand",
      destinationIata: "HKT",
      contentLanguage: "sl",
      days: [
        day({ day: 13, city: "Krabi", lat: 8.08, lng: 98.91 }),
        day({
          day: 14,
          city: "Koh Lipe",
          lat: 6.48,
          lng: 99.31,
          activities: {
            morning: [
              {
                name: "Prevoz iz Krabija do Koh Lipe",
                type: "TRANSPORT",
                description:
                  "Kombi do pristanišča Klong Jilad (Krabi), od tam trajekt do Koh Lipe.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ],
    } as AiTripPlan;
    enrichIslandAirportTransfers(plan, { destinationIata: "HKT", language: "sl" });
    const act = plan.days[1]!.activities!.morning[0]!;
    expect(act.name).toMatch(/Kombi|Van|Pak Bara/i);
    expect(act.name).not.toMatch(/Hat Yai|\bHDY\b|Let /i);
    expect(act.description).toMatch(/Pak Bara/i);
    expect(act.description).toMatch(/ne obstaja|no Krabi/i);
    expect(plan.days[1]!.transportation!.map((l) => l.type)).toEqual(["van", "ferry"]);
    expect(plan.days[1]!.transportation![0]!.from).toMatch(/Krabi/i);
  });
});
