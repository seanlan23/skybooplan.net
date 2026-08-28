import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import {
  dayLocalTipsContext,
  scrubDayLocalTips,
  scrubLocalTipsOnPlan,
} from "@/lib/localTipsSanitize";

function day(partial: Partial<DayPlan> & { day: number }): DayPlan {
  return {
    title: partial.title ?? `Day ${partial.day}`,
    city: partial.city ?? "New York",
    lat: 40.71,
    lng: -74.01,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 120,
    ...partial,
  } as DayPlan;
}

describe("scrubDayLocalTips", () => {
  it("strips temple-dress leftovers when the day never visits a temple", () => {
    const ctx = dayLocalTipsContext(
      day({
        day: 3,
        city: "New York",
        title: "Broadway and The Met",
        activities: {
          morning: [{ name: "The Met", description: "Reserve timed entry." }],
          afternoon: [{ name: "Central Park", description: "Walk south to Columbus Circle." }],
          evening: [{ name: "Broadway", description: "Evening show." }],
        },
      }),
    );
    const out = scrubDayLocalTips(
      "V ZDA napitnina 18–20 %. V templju pokrij ramena. The Met zahteva časovni vstop. Bonton na Broadwayu: brez fotografij med predstavo.",
      ctx,
    );
    expect(out).toMatch(/napitnina|The Met|Broadway/i);
    expect(out).not.toMatch(/templj/i);
    expect(out).not.toMatch(/niso pričakovane/i);
  });

  it("keeps temple dress on a Wat Pho day", () => {
    const ctx = dayLocalTipsContext(
      day({
        day: 2,
        city: "Bangkok",
        title: "Wat Pho",
        activities: {
          morning: [{ name: "Wat Pho", description: "Reclining Buddha." }],
          afternoon: [],
          evening: [],
        },
      }),
    );
    const out = scrubDayLocalTips(
      "Do not drink tap water. Cover shoulders at temples. Street food is safer at busy stalls.",
      ctx,
    );
    expect(out).toMatch(/temple/i);
    expect(out).toMatch(/tap water/i);
  });
});

describe("scrubLocalTipsOnPlan", () => {
  it("drops identical copy-paste local_tips on later days", () => {
    const canned =
      "Voda iz pipe ni pitna. Ulična hrana na prometnih stojnicah. V templju pokrij ramena; napitnine niso pričakovane.";
    const plan = {
      destinationName: "USA",
      days: [
        day({
          day: 2,
          city: "New York",
          title: "The Met",
          localTips: canned,
          activities: {
            morning: [{ name: "The Met", description: "Timed tickets." }],
            afternoon: [{ name: "Fifth Avenue", description: "Walk." }],
            evening: [{ name: "Broadway", description: "Show." }],
          },
        }),
        day({
          day: 3,
          city: "New York",
          title: "Harlem gospel",
          localTips: canned,
          activities: {
            morning: [{ name: "Gospel mass in Harlem", description: "Arrive early, modest dress." }],
            afternoon: [{ name: "Apollo Theater", description: "Tour." }],
            evening: [{ name: "Dinner in Harlem", description: "Tip 20%." }],
          },
        }),
      ],
    } as AiTripPlan;
    expect(scrubLocalTipsOnPlan(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.localTips).toBeTruthy();
    expect(plan.days[0]!.localTips).not.toMatch(/templj/i);
    expect(plan.days[1]!.localTips).toBeFalsy();
  });
});
