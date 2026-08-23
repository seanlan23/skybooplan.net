import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { stripCrossStayLeaks } from "@/lib/stayLeakGuard";
import { inferBudgetCountryFromPlace } from "@/lib/countryDailyBudget";

const KASANE = { lat: -17.8, lng: 25.15 };
const VILANCULOS = { lat: -21.99, lng: 35.32 };

const day = (partial: Partial<DayPlan> & { city: string; day: number }): DayPlan => ({
  date: "2026-11-01",
  title: "Dan",
  morning: "",
  afternoon: "",
  evening: "",
  dailyBudgetEur: 80,
  lat: KASANE.lat,
  lng: KASANE.lng,
  ...partial,
});

const plan = (days: DayPlan[]): AiTripPlan => ({
  destinationName: "Test",
  summary: "",
  totalBudgetEur: 0,
  centerLat: days[0]?.lat ?? 0,
  centerLng: days[0]?.lng ?? 0,
  days,
});

describe("stripCrossStayLeaks", () => {
  it("drops the other country's beach/snorkel on a sleep-city day and a premature exit flight", () => {
    const p = plan([
      day({
        day: 13,
        city: "Kasane",
        ...KASANE,
        activities: {
          morning: [
            {
              name: "Nadaljevalni let iz Johannesburga v Vilanculos (Mozambik)",
              type: "TRANSPORT",
              transportType: "flight",
            },
          ],
          afternoon: [
            { name: "Chobe River Boat Safari", type: "ACTIVITY" },
            { name: "Šnorklanje v koralnih grebenih Two Mile", type: "ACTIVITY" },
          ],
          evening: [],
        },
      }),
      day({
        day: 14,
        city: "Kasane",
        ...KASANE,
        activities: {
          morning: [{ name: "Viktorijini slapovi", type: "SIGHT" }],
          afternoon: [{ name: "Sprostitev na plaži Vilanculos", type: "ACTIVITY" }],
          evening: [],
        },
      }),
    ]);

    expect(stripCrossStayLeaks(p)).toBeGreaterThan(0);
    const d13 = p.days[0]!.activities!;
    expect(d13.morning.map((a) => a.name).join(" ")).not.toMatch(/Vilanculos/i);
    expect(d13.afternoon.map((a) => a.name)).toEqual(["Chobe River Boat Safari"]);
    expect(p.days[1]!.activities!.afternoon).toEqual([]);
    expect(p.days[1]!.activities!.morning.map((a) => a.name)).toEqual(["Viktorijini slapovi"]);
  });

  it("keeps the exit flight on the last night and clears leftover local sights", () => {
    const p = plan([
      day({
        day: 10,
        city: "Kasane",
        ...KASANE,
        activities: {
          morning: [
            {
              name: "Let Kasane → Vilanculos",
              type: "TRANSPORT",
              transportType: "flight",
            },
          ],
          afternoon: [{ name: "Chobe River Boat Safari", type: "ACTIVITY" }],
          evening: [],
        },
      }),
      day({
        day: 11,
        city: "Vilanculos",
        ...VILANCULOS,
        activities: {
          morning: [{ name: "Sprostitev na plaži Vilanculos", type: "ACTIVITY" }],
          afternoon: [],
          evening: [],
        },
      }),
    ]);

    stripCrossStayLeaks(p);
    expect(p.days[0]!.activities!.morning).toHaveLength(1);
    expect(p.days[0]!.activities!.afternoon).toEqual([]);
    expect(p.days[1]!.activities!.morning).toHaveLength(1);
  });
});

describe("inferBudgetCountryFromPlace Mozambique", () => {
  it("maps Vilanculos / Two Mile Reef to MZ and Kasane to BW", () => {
    expect(inferBudgetCountryFromPlace("Vilanculos")).toBe("MZ");
    expect(inferBudgetCountryFromPlace("Two Mile Reef")).toBe("MZ");
    expect(inferBudgetCountryFromPlace("Šnorklanje v koralnih grebenih Two Mile")).toBe("MZ");
    expect(inferBudgetCountryFromPlace("Kasane")).toBe("BW");
  });
});
