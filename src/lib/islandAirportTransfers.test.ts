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

  it("splits a fake Tulum→Holbox ferry into van + Chiquilá ferry", () => {
    expect(getIslandAirportAccessDef("Isla Holbox")?.id).toBe("holbox");
    const plan: AiTripPlan = {
      destinationName: "Mexico",
      destinationIata: "CUN",
      contentLanguage: "sl",
      days: [
        day({ day: 10, city: "Tulum" }),
        day({
          day: 11,
          city: "Isla Holbox",
          transportation: [
            { type: "ferry", from: "Tulum", to: "Isla Holbox", duration: "0h 30m" },
          ],
        }),
      ],
    } as AiTripPlan;
    enrichIslandAirportTransfers(plan, { destinationIata: "CUN", language: "sl" });
    const holbox = plan.days[1]!;
    expect(holbox.transportation!.map((l) => l.type)).toEqual(["van", "ferry"]);
    expect(holbox.transportation![0]!.from).toMatch(/Tulum/i);
    expect(holbox.transportation![0]!.to).toMatch(/Chiquilá/i);
    expect(holbox.transportation![1]!.from).toMatch(/Chiquilá/i);
    expect(holbox.transportation![1]!.to).toMatch(/Holbox/i);
    expect(holbox.transportationTips).toMatch(/Chiquilá/i);
    expect(holbox.transportationTips).toMatch(/Ni direktnega trajekta/i);
  });

  it("rewrites a fake Tulum→Holbox van+ferry so both legs go via Chiquilá", () => {
    const plan: AiTripPlan = {
      destinationName: "Mexico",
      destinationIata: "CUN",
      contentLanguage: "sl",
      days: [
        day({ day: 10, city: "Tulum" }),
        day({
          day: 11,
          city: "Isla Holbox",
          transportation: [
            { type: "van", from: "Tulum", to: "Isla Holbox", duration: "2h 30min", estimatedPrice: 25 },
            { type: "ferry", from: "Tulum", to: "Isla Holbox", duration: "25min", estimatedPrice: 10 },
          ],
        }),
      ],
    } as AiTripPlan;
    enrichIslandAirportTransfers(plan, { destinationIata: "CUN", language: "sl" });
    const holbox = plan.days[1]!;
    expect(holbox.transportation!.map((l) => l.type)).toEqual(["van", "ferry"]);
    expect(holbox.transportation![0]!.to).toMatch(/Chiquilá/i);
    expect(holbox.transportation![1]!.from).toMatch(/Chiquilá/i);
    expect(holbox.transportation![0]!.to).not.toMatch(/Holbox/i);
    expect(holbox.transportation![1]!.from).not.toMatch(/Tulum/i);
  });

  it("leaves Holbox via CUN + flight when the next city is Mexico City", () => {
    const plan: AiTripPlan = {
      destinationName: "Mexico",
      destinationIata: "MEX",
      contentLanguage: "sl",
      days: [
        day({ day: 12, city: "Isla Holbox" }),
        day({
          day: 13,
          city: "Mexico City",
          transportation: [
            { type: "ferry", from: "Isla Holbox", to: "Chiquilá", duration: "20–30 min", estimatedPrice: 12 },
            { type: "van", from: "Chiquilá", to: "Mexico City", duration: "2–2.5h", estimatedPrice: 20 },
          ],
        }),
      ],
    } as AiTripPlan;
    enrichIslandAirportTransfers(plan, { destinationIata: "MEX", language: "sl" });
    const mex = plan.days[1]!;
    expect(mex.transportation!.map((l) => l.type)).toEqual(["ferry", "van", "flight"]);
    expect(mex.transportation![0]!.to).toMatch(/Chiquilá/i);
    expect(mex.transportation![1]!.from).toMatch(/Chiquilá/i);
    expect(mex.transportation![1]!.to).toMatch(/Cancún|CUN/i);
    expect(mex.transportation![1]!.to).not.toMatch(/Mexico City/i);
    expect(mex.transportation![2]!.from).toMatch(/Cancún|CUN/i);
    expect(mex.transportation![2]!.to).toMatch(/Mexico City/i);
    expect(mex.transportationTips).toMatch(/Cancún|CUN/i);
    expect(mex.transportationTips).not.toMatch(/kombi\/avtobus do Mexico City/i);
  });
});
