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
});
