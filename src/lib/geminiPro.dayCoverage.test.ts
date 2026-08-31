import { describe, expect, it } from "vitest";
import {
  hasAcceptablePlanDayCoverage,
  incompletePlanDayCoverageMessage,
  shouldCheckPlanDayCoverage,
  tripDayCount,
} from "@/lib/geminiPro.functions";

describe("plan day coverage", () => {
  it("counts MUC→BKK Sep 19–26 as 8 calendar days ((end − start) + 1)", () => {
    expect(tripDayCount("2026-09-19", "2026-09-26")).toBe(8);
  });

  it("counts MUC→BKK 26 Oct–10 Nov as 16 calendar days", () => {
    expect(tripDayCount("2026-10-26", "2026-11-10")).toBe(16);
  });

  it("rejects a 1-day plan for an 8-day trip", () => {
    expect(hasAcceptablePlanDayCoverage(1, 8)).toBe(false);
    expect(incompletePlanDayCoverageMessage(1, 8)).toContain("1/8");
  });

  it("requires the exact calendar day count for every trip length", () => {
    expect(hasAcceptablePlanDayCoverage(3, 4)).toBe(false);
    expect(hasAcceptablePlanDayCoverage(4, 4)).toBe(true);
  });

  it("requires full coverage for trips of 5+ days", () => {
    expect(hasAcceptablePlanDayCoverage(7, 8)).toBe(false);
    expect(hasAcceptablePlanDayCoverage(7, 16)).toBe(false);
    expect(hasAcceptablePlanDayCoverage(8, 8)).toBe(true);
    expect(incompletePlanDayCoverageMessage(7, 16)).toBe(
      "Načrt je nepopoln (7/16 dni). Poskusi znova.",
    );
  });

  it("requires both days for a 2-day trip", () => {
    expect(hasAcceptablePlanDayCoverage(1, 2)).toBe(false);
    expect(hasAcceptablePlanDayCoverage(2, 2)).toBe(true);
  });

  it("does not check day counts for single_base / resortStay", () => {
    expect(shouldCheckPlanDayCoverage({ tripStyle: "single_base" })).toBe(false);
    expect(shouldCheckPlanDayCoverage({ resortStay: { arrivalProtocol: {} } })).toBe(
      false,
    );
    expect(shouldCheckPlanDayCoverage({ tripStyle: "explorer" })).toBe(true);
    expect(shouldCheckPlanDayCoverage({ tripStyle: "roadtrip" })).toBe(true);
    expect(
      shouldCheckPlanDayCoverage({
        tripStyle: "roadtrip",
        resortStay: { arrivalProtocol: {} },
      }),
    ).toBe(true);
  });
});
