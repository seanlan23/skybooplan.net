import { describe, expect, it } from "vitest";
import {
  hasAcceptablePlanDayCoverage,
  incompletePlanDayCoverageMessage,
  tripDayCount,
} from "@/lib/geminiPro.functions";

describe("plan day coverage", () => {
  it("counts MUC→BKK Sep 19–26 as 8 calendar days", () => {
    expect(tripDayCount("2026-09-19", "2026-09-26")).toBe(8);
  });

  it("rejects a 1-day plan for an 8-day trip", () => {
    expect(hasAcceptablePlanDayCoverage(1, 8)).toBe(false);
    expect(incompletePlanDayCoverageMessage(1, 8)).toContain("1/8");
  });

  it("allows one missing day only on short trips", () => {
    expect(hasAcceptablePlanDayCoverage(3, 4)).toBe(true);
    expect(hasAcceptablePlanDayCoverage(4, 4)).toBe(true);
  });

  it("requires full coverage for trips of 5+ days", () => {
    expect(hasAcceptablePlanDayCoverage(7, 8)).toBe(false);
    expect(hasAcceptablePlanDayCoverage(8, 8)).toBe(true);
  });

  it("requires both days for a 2-day trip", () => {
    expect(hasAcceptablePlanDayCoverage(1, 2)).toBe(false);
    expect(hasAcceptablePlanDayCoverage(2, 2)).toBe(true);
  });
});
