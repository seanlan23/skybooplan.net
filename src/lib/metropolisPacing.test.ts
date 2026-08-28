import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  INTERIOR_SLOW_MIN_NIGHTS,
  isInteriorSlowStay,
  isTransitMetropolis,
  metroShareCapNights,
  metropolisPacingPromptBlock,
  paceMetropolisStays,
} from "@/lib/metropolisPacing";

function day(
  n: number,
  city: string,
  extra?: Partial<AiTripPlan["days"][number]>,
): AiTripPlan["days"][number] {
  return {
    day: n,
    date: `2026-11-${String(n).padStart(2, "0")}`,
    title: city,
    city,
    focusName: city,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 50,
    lat: 0,
    lng: 0,
    category: "city",
    ...extra,
  };
}

function plan(days: AiTripPlan["days"], wishes?: string): AiTripPlan {
  return {
    destinationName: "Thailand",
    summary: "test",
    contentLanguage: "sl",
    totalBudgetEur: 0,
    centerLat: 13.7,
    centerLng: 100.5,
    destinationIata: "BKK",
    days,
    wishes,
  };
}

describe("metropolis pacing facts", () => {
  it("treats named gateways as transit metropolises", () => {
    expect(isTransitMetropolis("Bangkok")).toBe(true);
    expect(isTransitMetropolis("Kuala Lumpur")).toBe(true);
    expect(isTransitMetropolis("Toronto")).toBe(true);
    expect(isTransitMetropolis("Tokyo")).toBe(true);
    expect(isTransitMetropolis("Phuket")).toBe(false);
    expect(isTransitMetropolis("Chiang Mai")).toBe(false);
  });

  it("flags interior slow stays", () => {
    expect(isInteriorSlowStay("Chiang Mai")).toBe(true);
    expect(isInteriorSlowStay("Koh Yao Noi")).toBe(true);
    expect(isInteriorSlowStay("Khao Sok")).toBe(true);
    expect(isInteriorSlowStay("Bangkok")).toBe(false);
  });

  it("caps the same metropolis at 30% of trip length", () => {
    expect(metroShareCapNights(16)).toBe(4);
    expect(metroShareCapNights(10)).toBe(3);
  });
});

describe("paceMetropolisStays", () => {
  it("trims a long opening Bangkok stay and feeds Chiang Mai to 3 nights", () => {
    const p = plan([
      day(1, "Munich", { inFlightDay: true }),
      ...Array.from({ length: 6 }, (_, i) => day(i + 2, "Bangkok")),
      day(8, "Chiang Mai"),
      day(9, "Chiang Mai"),
      ...Array.from({ length: 4 }, (_, i) => day(i + 10, "Koh Yao Noi")),
      day(14, "Bangkok"),
      day(15, "Bangkok"),
      day(16, "Bangkok"),
    ]);
    expect(paceMetropolisStays(p)).toBeGreaterThan(0);
    const cities = p.days.filter((d) => !d.inFlightDay).map((d) => d.city);
    const bkkOpen = cities.slice(0, 6).filter((c) => c === "Bangkok").length;
    expect(bkkOpen).toBeLessThanOrEqual(3);
    expect(cities.filter((c) => c === "Chiang Mai").length).toBeGreaterThanOrEqual(
      INTERIOR_SLOW_MIN_NIGHTS,
    );
    expect(p.hotels?.find((h) => /chiang mai/i.test(h.city))?.nights).toBeGreaterThanOrEqual(3);
  });

  it("does not rewrite an explicit wish-list stay plan", () => {
    const wish = "1 noč Bangkok, 5 noči Chiang Mai, 8 noči Koh Yao Noi, 1 noč Bangkok";
    const p = plan(
      [
        day(1, "Bangkok"),
        ...Array.from({ length: 5 }, (_, i) => day(i + 2, "Chiang Mai")),
        ...Array.from({ length: 8 }, (_, i) => day(i + 7, "Koh Yao Noi")),
        day(15, "Bangkok"),
        day(16, "Bangkok"),
      ],
      wish,
    );
    expect(paceMetropolisStays(p)).toBe(0);
    expect(p.days[0]!.city).toBe("Bangkok");
    expect(p.days.filter((d) => d.city === "Bangkok")).toHaveLength(3);
  });

  it("leaves a single-city metropolis trip alone", () => {
    const p = plan(Array.from({ length: 8 }, (_, i) => day(i + 1, "Bangkok")));
    expect(paceMetropolisStays(p)).toBe(0);
    expect(p.days.every((d) => d.city === "Bangkok")).toBe(true);
  });
});

describe("metropolisPacingPromptBlock", () => {
  it("states hub caps and interior minima unless wishes lock the plan", () => {
    const open = metropolisPacingPromptBlock();
    expect(open).toMatch(/NAJVEČ 3 noči/);
    expect(open).toMatch(/NAJVEČ 2 noči/);
    expect(open).toMatch(/30 %/);
    expect(open).toMatch(/Chiang Mai/);
    expect(open).toMatch(/Koh Yao Noi|Khao Sok/);
    expect(metropolisPacingPromptBlock({ lockUserStayPlan: true })).toMatch(/premaga omejitev/);
  });
});
