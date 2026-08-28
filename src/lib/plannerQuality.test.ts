import { describe, expect, it } from "vitest";
import {
  HARD_DRIVE_KM,
  LAST_DAY_HOME_MAX_HOURS,
  TARGET_DRIVE_HOURS,
  annotateHitAndRunStays,
  borderPenaltyHours,
  plannerQualityPromptBlock,
  prefersTwoNights,
  slowBorderNote,
  stealNightForHitAndRun,
} from "@/lib/plannerQuality";

describe("borderPenaltyHours", () => {
  it("adds summer hours on slow land borders, not on Schengen internals", () => {
    expect(borderPenaltyHours("HR", "ME", "2026-08-10")).toBe(3);
    expect(borderPenaltyHours("AT", "DE", "2026-08-10")).toBe(0);
    expect(borderPenaltyHours("US", "MX", "2026-07-04")).toBe(2.5);
    expect(borderPenaltyHours("TH", "KH", "2026-08-01")).toBe(2);
  });

  it("uses a lower off-peak penalty", () => {
    expect(borderPenaltyHours("HR", "ME", "2026-03-10")).toBe(1.5);
  });
});

describe("prefersTwoNights", () => {
  it("asks for two nights in major cities on week-plus trips", () => {
    expect(prefersTwoNights("Kyoto", 12)).toBe(true);
    expect(prefersTwoNights("Kotor", 10)).toBe(true);
    expect(prefersTwoNights("Kyoto", 4)).toBe(false);
    expect(prefersTwoNights("Randomville", 14)).toBe(false);
  });
});

describe("plannerQualityPromptBlock", () => {
  it("is global — not a Balkans-only mode — and caps road days at 5h", () => {
    const road = plannerQualityPromptBlock({ road: true, totalDays: 12 });
    expect(road).toMatch(/vse destinacije/i);
    expect(road).not.toMatch(/Balkans product/i);
    expect(road).toContain(String(HARD_DRIVE_KM));
    expect(road).toContain(String(LAST_DAY_HOME_MAX_HOURS));
    expect(road).toMatch(/krog|tranzitne baze/i);
    expect(road).toMatch(/US–MX|TH–KH/);
    expect(road).toMatch(/PREPOVEDANO izmišljati imena hotelov/);
    expect(road).toMatch(/2 noči/);
    expect(road).toMatch(/8–16 h|1500–2200|day\.city = izhodišče/i);
    expect(road).toMatch(/Uživajte/);
  });

  it("does not apply the 5h road cap to flights", () => {
    const air = plannerQualityPromptBlock({ road: false, totalDays: 16 });
    expect(air).toMatch(/NE velja za mednarodni let/);
    expect(air).toMatch(/zadnji dan/i);
    expect(air).toMatch(/tranzitna metropola|30 %/);
    expect(air).toMatch(/Chiang Mai/);
    expect(air).toMatch(/4–6 glavnih baz|zig-zag/);
    expect(air).toMatch(/NI dopoldanskih odhodov|NOČNI board/);
  });

  it("locks night counts when the user spelled a stay plan", () => {
    const locked = plannerQualityPromptBlock({
      road: false,
      totalDays: 16,
      lockUserStayPlan: true,
    });
    expect(locked).toMatch(/ZAKLENJEN/);
    expect(locked).not.toMatch(/ukrade noč sosedu z 3\+/);
    expect(locked).toMatch(/premaga omejitev/);
    expect(locked).not.toMatch(/največ 4–6 glavnih baz/);
  });
});

describe("stealNightForHitAndRun", () => {
  it("gives Rome a second night by taking Florence's last of three", () => {
    const plan = {
      contentLanguage: "sl",
      days: [
        { day: 1, city: "Venice" },
        { day: 2, city: "Florence" },
        { day: 3, city: "Florence" },
        { day: 4, city: "Florence", activities: { morning: [{ name: "Uffizi", type: "SIGHT" }], afternoon: [], evening: [] } },
        { day: 5, city: "Rome", drivingDistanceKm: 270, activities: { morning: [], afternoon: [], evening: [{ name: "Večerja", type: "EAT" }] } },
        { day: 6, city: "Naples" },
        { day: 7, city: "Naples" },
        { day: 8, city: "Mežica" },
      ],
    };
    expect(stealNightForHitAndRun(plan as never)).toBe(1);
    expect(plan.days[3]!.city).toBe("Rome");
    expect(plan.days[3]!.activities!.morning).toHaveLength(0);
    expect(plan.days[4]!.city).toBe("Rome");
  });
});

describe("annotateHitAndRunStays", () => {
  it("flags a 1-night Kyoto stay on a 12-day trip", () => {
    const plan = {
      contentLanguage: "en",
      days: Array.from({ length: 12 }, (_, i) => ({
        day: i + 1,
        city: i === 4 ? "Kyoto" : "Osaka",
        title: "Day",
        drivingDistanceKm: 20,
        travelHack: "",
      })),
    };
    expect(annotateHitAndRunStays(plan as never)).toBeGreaterThan(0);
    expect(plan.days[4]!.localWarnings).toMatch(/2 nights/i);
    expect(plan.days[4]!.travelHack).not.toMatch(/2 nights/i);
  });
});
