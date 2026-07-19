import { describe, expect, it } from "vitest";
import {
  buildUserStayPlanPromptBlock,
  hasExplicitStayPlan,
  parseStayPlanFromWishes,
  staySegmentsToDayPlan,
} from "@/lib/userStayPlan";
import { buildCuratedRoutePromptBlock } from "@/lib/curatedRoutes";

describe("userStayPlan", () => {
  const wish =
    "Želim Prvo noč phuketa, 3 dni khao soka, 2 dni ao nanga, 5 dni koh phi phi, in dva dni Patronka";

  it("detects explicit multi-stop stay plan", () => {
    expect(hasExplicitStayPlan(wish)).toBe(true);
    expect(hasExplicitStayPlan("samo plaže in zabava")).toBe(false);
  });

  it("parses Slovenian day allocations + Patronka→Patong", () => {
    const parsed = parseStayPlanFromWishes(wish);
    expect(parsed.map((p) => p.city)).toEqual([
      "Phuket",
      "Khao Sok",
      "Ao Nang",
      "Koh Phi Phi",
      "Patong",
    ]);
    expect(parsed.map((p) => p.nights)).toEqual([1, 3, 2, 5, 2]);
  });

  it("maps segments onto trip days (leftover on last stop)", () => {
    const plan = staySegmentsToDayPlan(parseStayPlanFromWishes(wish), 16);
    expect(plan[0]).toMatchObject({ city: "Phuket", startDay: 1, endDay: 1 });
    expect(plan[1]).toMatchObject({ city: "Khao Sok", startDay: 2, endDay: 4 });
    expect(plan[2]).toMatchObject({ city: "Ao Nang", startDay: 5, endDay: 6 });
    expect(plan[3]).toMatchObject({ city: "Koh Phi Phi", startDay: 7, endDay: 11 });
    // 1+3+2+5+2 = 13; leftover days 14–16 stretch Patong
    expect(plan[4]).toMatchObject({ city: "Patong", startDay: 12, endDay: 16 });
  });

  it("builds absolute-priority prompt block", () => {
    const block = buildUserStayPlanPromptBlock(wish, 16);
    expect(block).toMatch(/ABSOLUTNA PREDNOST/);
    expect(block).toMatch(/Khao Sok/);
    expect(block).toMatch(/Koh Phi Phi/);
    expect(block).toMatch(/Patong/);
  });

  it("parses Slovenian noči + typo phkuket", () => {
    const nightsWish =
      "prvo noč phkuket, 3 noči khao sok, 2 noči ao nang, 5 noči koh phi phi 2 noči patong";
    expect(hasExplicitStayPlan(nightsWish)).toBe(true);
    const parsed = parseStayPlanFromWishes(nightsWish);
    expect(parsed.map((p) => p.city)).toEqual([
      "Phuket",
      "Khao Sok",
      "Ao Nang",
      "Koh Phi Phi",
      "Patong",
    ]);
    expect(parsed.map((p) => p.nights)).toEqual([1, 3, 2, 5, 2]);
  });

  it("skips curated Andaman graph when user stay plan is present", () => {
    const curated = buildCuratedRoutePromptBlock({
      nDays: 16,
      destinationIata: "HKT",
      priorities: ["beaches"],
      wishes: wish,
      skipForUserStayPlan: true,
    });
    expect(curated).toBeUndefined();

    const withoutSkip = buildCuratedRoutePromptBlock({
      nDays: 16,
      destinationIata: "HKT",
      priorities: ["beaches"],
      wishes: "phuket beaches",
      skipForUserStayPlan: false,
    });
    expect(withoutSkip).toMatch(/KURIRANA POT/);
  });
});
