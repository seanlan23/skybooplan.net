import { describe, expect, it } from "vitest";
import {
  buildItineraryRouteOverview,
  collectStayCities,
} from "@/lib/itineraryRouteOverview";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";

function day(partial: Partial<DayPlan> & Pick<DayPlan, "day" | "city">): DayPlan {
  return {
    date: "2026-06-01",
    title: partial.city ?? "Day",
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 0,
    lat: 0,
    lng: 0,
    focusName: partial.city ?? "",
    category: "activity",
    ...partial,
  };
}

function plan(days: DayPlan[], extra: Partial<AiTripPlan> = {}): AiTripPlan {
  return {
    destinationName: "Kuba",
    summary: "",
    totalBudgetEur: 0,
    centerLat: 0,
    centerLng: 0,
    days,
    originPlace: "Milano, Italija",
    ...extra,
  };
}

describe("collectStayCities", () => {
  it("returns unique cities in visit order", () => {
    const cities = collectStayCities([
      day({ day: 1, city: "Havana" }),
      day({ day: 2, city: "Havana" }),
      day({ day: 3, city: "Viñales" }),
      day({ day: 4, city: "Trinidad" }),
    ]);
    expect(cities).toEqual(["Havana", "Viñales", "Trinidad"]);
  });

  it("treats a missing days list as no stays", () => {
    expect(collectStayCities(undefined)).toEqual([]);
    expect(buildItineraryRouteOverview({
      destinationName: "Maldivi",
      summary: "",
      totalBudgetEur: 0,
      centerLat: 0,
      centerLng: 0,
      days: undefined as never,
    })).toEqual([]);
  });

  it("skips in-flight days without a stay city", () => {
    const cities = collectStayCities([
      day({ day: 1, city: "Havana", inFlightDay: true }),
      day({ day: 2, city: "Viñales" }),
    ]);
    expect(cities).toEqual(["Viñales"]);
  });
});

describe("buildItineraryRouteOverview", () => {
  it("builds flight + hotel chain with return to origin", () => {
    const segments = buildItineraryRouteOverview(
      plan([
        day({ day: 1, city: "Havana" }),
        day({ day: 2, city: "Viñales" }),
        day({ day: 3, city: "Trinidad" }),
        day({ day: 4, city: "Varadero" }),
      ]),
    );

    expect(segments).toEqual([
      { kind: "place", label: "Milano" },
      { kind: "flight" },
      { kind: "stay", label: "Havana" },
      { kind: "stay", label: "Viñales" },
      { kind: "stay", label: "Trinidad" },
      { kind: "stay", label: "Varadero" },
      { kind: "flight" },
      { kind: "place", label: "Milano" },
    ]);
  });

  it("uses transfer arrows for ground transport trips", () => {
    const segments = buildItineraryRouteOverview(
      plan([day({ day: 1, city: "Barcelona" })], {
        groundTransportMode: "car",
        originPlace: "Ljubljana",
      }),
    );

    expect(segments[1]).toEqual({ kind: "transfer" });
    expect(segments[segments.length - 2]).toEqual({ kind: "transfer" });
  });
});
