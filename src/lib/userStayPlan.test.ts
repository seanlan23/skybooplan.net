import { describe, expect, it } from "vitest";
import {
  applyUserStayPlan,
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

  it("maps segments onto hotel days (leftover on last stop, never day N)", () => {
    const plan = staySegmentsToDayPlan(parseStayPlanFromWishes(wish), 16);
    expect(plan[0]).toMatchObject({ city: "Phuket", startDay: 1, endDay: 1 });
    expect(plan[1]).toMatchObject({ city: "Khao Sok", startDay: 2, endDay: 4 });
    expect(plan[2]).toMatchObject({ city: "Ao Nang", startDay: 5, endDay: 6 });
    expect(plan[3]).toMatchObject({ city: "Koh Phi Phi", startDay: 7, endDay: 11 });
    // 1+3+2+5+2 = 13; last hotel day = 15 (day 16 = checkout); leftover stretches Patong
    expect(plan[4]).toMatchObject({ city: "Patong", startDay: 12, endDay: 15 });
  });

  it("starts on arrival day and never pads the first base", () => {
    const nightsWish =
      "1 noč Phuket, 3 noči Khao Sok, 2 noči Ao Nang, 5 noči Koh Phi Phi, 3 noči Patong";
    const plan = staySegmentsToDayPlan(parseStayPlanFromWishes(nightsWish), 16, {
      arrivalDay: 2,
    });
    expect(plan.map((s) => [s.city, s.nights, s.startDay, s.endDay])).toEqual([
      ["Phuket", 1, 2, 2],
      ["Khao Sok", 3, 3, 5],
      ["Ao Nang", 2, 6, 7],
      ["Koh Phi Phi", 5, 8, 12],
      ["Patong", 3, 13, 15],
    ]);
  });

  it("builds absolute-priority prompt block", () => {
    const block = buildUserStayPlanPromptBlock(wish, 16);
    expect(block).toMatch(/ABSOLUTNA PREDNOST/);
    expect(block).toMatch(/Khao Sok/);
    expect(block).toMatch(/Koh Phi Phi/);
    expect(block).toMatch(/Patong/);
    expect(block).toMatch(/PRVO bazo/);
    expect(block).toMatch(/enodnevni izlet/);
  });

  it("stamps days/hotels from wishes and overwrites extra first-base nights", () => {
    const nightsWish =
      "1 noč Phuket, 3 noči Khao Sok, 2 noči Ao Nang, 5 noči Koh Phi Phi, 3 noči Patong";
    const days = Array.from({ length: 16 }, (_, i) => ({
      day: i + 1,
      city: i === 0 ? "Munich" : "Phuket",
      inFlightDay: i === 0,
    }));
    const plan = { days, wishes: nightsWish };
    expect(applyUserStayPlan(plan, { arrivalDay: 2 })).toBe(true);
    expect(plan.days[0]!.city).toBe("Munich");
    expect(plan.days.filter((d) => d.city === "Phuket" && !d.inFlightDay)).toHaveLength(1);
    expect(plan.days[1]!.city).toBe("Phuket");
    expect(plan.days[2]!.city).toBe("Khao Sok");
    expect(plan.days[4]!.city).toBe("Khao Sok");
    expect(plan.days[5]!.city).toBe("Ao Nang");
    expect(plan.days[7]!.city).toBe("Koh Phi Phi");
    expect(plan.days[11]!.city).toBe("Koh Phi Phi");
    expect(plan.days[12]!.city).toBe("Patong");
    expect(plan.days[14]!.city).toBe("Patong");
    expect(plan.days[15]!.city).toBe("Patong");
    expect(plan.hotels?.map((h) => [h.city, h.nights])).toEqual([
      ["Phuket", 1],
      ["Khao Sok", 3],
      ["Ao Nang", 2],
      ["Koh Phi Phi", 5],
      ["Patong", 3],
    ]);
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
    expect(withoutSkip).toMatch(/PREDLOG POTI|KURIRANA POT/);
  });
});
