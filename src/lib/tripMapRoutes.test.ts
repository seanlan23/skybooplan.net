import { describe, expect, it } from "vitest";
import type { DayPlan } from "@/lib/aiPlan.functions";
import { buildSegmentSpecs, classifyTransportMode } from "@/lib/tripMapRoutes";

function day(partial: Partial<DayPlan> & Pick<DayPlan, "day" | "city">): DayPlan {
  return {
    date: "2026-06-01",
    title: partial.title ?? partial.city,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 80,
    lat: 0,
    lng: 0,
    focusName: partial.city,
    category: "activity",
    ...partial,
  };
}

describe("classifyTransportMode", () => {
  it("uses driving for inter-city van transfer (Puerto Princesa → El Nido)", () => {
    const elNidoDay = day({
      day: 3,
      city: "El Nido",
      title: "El Nido — limeni zaliv",
      afternoon: "Transfer iz Puerto Princesa z minibusom ob obalni cesti.",
    });

    expect(
      classifyTransportMode(elNidoDay, 230, { cityChanged: true }),
    ).toBe("driving");
  });

  it("uses driving for explicit transportation van even without cityChanged flag", () => {
    const krabiDay = day({
      day: 5,
      city: "Krabi",
      title: "Travel to Krabi",
      transportation: [
        {
          type: "van",
          from: "Phuket Patong",
          to: "Ao Nang, Krabi",
          duration: "2h 30min",
          estimatedPrice: 18,
        },
      ],
    });

    expect(classifyTransportMode(krabiDay, 160, { cityChanged: false })).toBe("driving");
  });

  it("uses flight arc when day explicitly mentions a flight", () => {
    const flightDay = day({
      day: 5,
      city: "Chiang Mai",
      transportation: [{ type: "flight", from: "Bangkok", to: "Chiang Mai", duration: "1h 15m", estimatedPrice: 45 }],
    });

    expect(
      classifyTransportMode(flightDay, 600, { cityChanged: true }),
    ).toBe("flight");
  });

  it("returns null for same-city days (markers only)", () => {
    const bangkokDay = day({ day: 2, city: "Bangkok", title: "Bangkok temples" });
    expect(classifyTransportMode(bangkokDay, 5, { cityChanged: false })).toBeNull();
  });
});

describe("buildSegmentSpecs", () => {
  it("creates a driving leg between two different cities", () => {
    const puerto: [number, number] = [118.735, 9.739];
    const elNido: [number, number] = [119.397, 11.195];

    const specs = buildSegmentSpecs(
      [
        { day: day({ day: 1, city: "Puerto Princesa" }), coord: puerto },
        { day: day({ day: 2, city: "El Nido", title: "El Nido arrival" }), coord: elNido },
      ],
      null,
    );

    expect(specs.some((s) => s.mode === "driving" && s.id === "leg-1-2")).toBe(true);
  });

  it("uses segment-by-segment driving for ground transport (no single long outbound line)", () => {
    const ljubljana: [number, number] = [14.505, 46.051];
    const venice: [number, number] = [12.315, 45.441];
    const rome: [number, number] = [12.496, 41.902];

    const specs = buildSegmentSpecs(
      [
        { day: day({ day: 1, city: "Ljubljana" }), coord: ljubljana },
        { day: day({ day: 2, city: "Venice" }), coord: venice },
        { day: day({ day: 3, city: "Rome" }), coord: rome },
      ],
      ljubljana,
      { groundTransportMode: "car" },
    );

    expect(specs.some((s) => s.id === "outbound-home")).toBe(false);
    const drivingIds = specs.filter((s) => s.mode === "driving").map((s) => s.id);
    expect(drivingIds).toContain("origin-day1");
    expect(drivingIds).toContain("leg-1-2");
    expect(drivingIds).toContain("leg-2-3");
  });
});
