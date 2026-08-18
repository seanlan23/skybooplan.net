import { describe, expect, it } from "vitest";
import {
  TARGET_DRIVE_HOURS,
  annotateHitAndRunStays,
  borderPenaltyHours,
  plannerQualityPromptBlock,
  prefersTwoNights,
  slowBorderNote,
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
    expect(road).toContain(String(TARGET_DRIVE_HOURS));
    expect(road).toMatch(/US–MX|TH–KH/);
    expect(road).toMatch(/PREPOVEDANO izmišljati imena hotelov/);
    expect(road).toMatch(/2 noči/);
  });

  it("does not apply the 5h road cap to flights", () => {
    const air = plannerQualityPromptBlock({ road: false, totalDays: 16 });
    expect(air).toMatch(/NE velja za mednarodni let/);
    expect(air).toMatch(/zadnji dan/i);
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
    expect(plan.days[4]!.travelHack).toMatch(/2 nights/i);
  });
});
