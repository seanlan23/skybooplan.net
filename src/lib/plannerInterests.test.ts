import { describe, expect, it } from "vitest";
import { formatPlannerInterests, MIN_PLANNER_INTERESTS } from "@/lib/plannerInterests";

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

  it("requires at least 3 interests in UI constant", () => {
    expect(MIN_PLANNER_INTERESTS).toBe(3);
  });
});
