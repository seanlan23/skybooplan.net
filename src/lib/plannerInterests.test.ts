import { describe, expect, it } from "vitest";
import { formatPlannerInterests, MIN_PLANNER_INTERESTS, parsePlannerInterestKeys } from "@/lib/plannerInterests";

describe("plannerInterests", () => {
  it("formats Slovenian labels for AI wishes", () => {
    expect(formatPlannerInterests(["beaches", "hikes", "nature"], "sl")).toBe(
      "sanjske plaže, pohodi, narava",
    );
  });

  it("formats German labels for AI wishes", () => {
    expect(formatPlannerInterests(["beaches", "fun", "sights"], "de")).toBe(
      "Traumstrände, viel Spaß, Sehenswürdigkeiten",
    );
  });

  it("returns empty lists when tags are missing (hero Resort / Mir has no planner form)", () => {
    expect(parsePlannerInterestKeys(undefined)).toEqual([]);
    expect(parsePlannerInterestKeys(null)).toEqual([]);
    expect(formatPlannerInterests(undefined, "sl")).toBe("");
  });

  it("requires at least 3 interests in UI constant", () => {
    expect(MIN_PLANNER_INTERESTS).toBe(3);
  });
});
