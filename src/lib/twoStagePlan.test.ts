import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  extractRouteMatrix,
  formatLockedRouteMatrix,
  isRenderableSlotCopy,
  stripUnrenderablePlanCopy,
  twoStagePromptBlock,
} from "@/lib/twoStagePlan";

const day = (partial: Partial<DayPlan> & { day: number; city: string }): DayPlan => ({
  date: "2026-11-01",
  title: "Poln naslov dneva",
  morning: "",
  afternoon: "",
  evening: "",
  dailyBudgetEur: 80,
  lat: -5.72,
  lng: 39.3,
  ...partial,
});

const plan = (days: DayPlan[]): AiTripPlan => ({
  destinationName: "Test",
  summary: "",
  totalBudgetEur: 0,
  centerLat: 0,
  centerLng: 0,
  contentLanguage: "sl",
  days,
});

describe("two-stage route matrix", () => {
  it("groups consecutive sleep cities and formats a locked prompt", () => {
    const matrix = extractRouteMatrix(
      plan([
        day({ day: 1, city: "Nungwi", date: "2026-11-01" }),
        day({ day: 2, city: "Nungwi", date: "2026-11-02" }),
        day({
          day: 3,
          city: "Stone Town",
          date: "2026-11-03",
          activities: {
            morning: [
              {
                name: "Prevoz Nungwi → Stone Town",
                type: "TRANSPORT",
                transportType: "van",
                description: "Kombi vzdolž obale.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      ]),
    );
    expect(matrix.bases).toHaveLength(2);
    expect(matrix.bases[0]).toMatchObject({ city: "Nungwi", startDay: 1, endDay: 2, nights: 2 });
    const locked = formatLockedRouteMatrix(matrix, true);
    expect(locked).toMatch(/ZAKLENJENA MATRIKA BAZ/);
    expect(locked).toMatch(/Nungwi/);
    expect(locked).toMatch(/Stone Town/);
    expect(locked).not.toMatch(/phuket|bangkok/i);
  });

  it("states phase 1 then phase 2 without mixing English on SL plans", () => {
    const p1 = twoStagePromptBlock({ phase: 1, slo: true });
    const p2 = twoStagePromptBlock({ phase: 2, slo: true });
    expect(p1).toMatch(/FAZA 1/);
    expect(p2).toMatch(/FAZA 2/);
    expect(p2).toMatch(/PREPOVEDANO/);
    expect(isRenderableSlotCopy("Dan 3", "…", { lang: "sl" })).toBe(false);
    expect(isRenderableSlotCopy("Morning in Nungwi", "", { lang: "sl" })).toBe(false);
    expect(
      isRenderableSlotCopy(
        "Sprehod po severni plaži Nungwija",
        "Po zajtrku hodite ob obali do rta.",
        { lang: "sl" },
      ),
    ).toBe(true);
  });

  it("strips stub slots and keeps a full Slovenian stay stop", () => {
    const p = plan([
      day({
        day: 4,
        city: "Nungwi",
        activities: {
          morning: [{ name: "Dan 3", type: "SIGHT", description: "…" }],
          afternoon: [
            {
              name: "Sprehod po obali Nungwija",
              type: "SIGHT",
              description: "Po zajtrku se sprehodite ob severni plaži.",
            },
          ],
          evening: [],
        },
      }),
    ]);
    expect(stripUnrenderablePlanCopy(p)).toBeGreaterThan(0);
    expect(p.days[0]!.activities!.morning).toEqual([]);
    expect(p.days[0]!.activities!.afternoon).toHaveLength(1);
  });
});
