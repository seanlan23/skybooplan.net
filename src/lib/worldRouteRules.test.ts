import { describe, expect, it } from "vitest";
import {
  worldRouteRulesMentionsDestination,
  worldRouteRulesPromptBlock,
} from "@/lib/worldRouteRules";

describe("worldRouteRulesPromptBlock", () => {
  it("states worldwide route sense without locking destinations", () => {
    const sl = worldRouteRulesPromptBlock(true);
    const en = worldRouteRulesPromptBlock(false);
    expect(sl).toMatch(/SMSEL POTI|ves svet/i);
    expect(en).toMatch(/ROUTE SENSE|worldwide/i);
    expect(sl).toMatch(/Najprej baze/i);
    expect(sl).toMatch(/NOVO bazo/i);
    expect(sl).toMatch(/Težek premik/i);
    expect(sl).toMatch(/zapuščeno regijo|En premik med dvema bazama/i);
    expect(sl).toMatch(/POI/i);
    expect(en).toMatch(/Bases first/i);
    expect(en).toMatch(/NEW base/i);
    expect(worldRouteRulesMentionsDestination(sl)).toBe(false);
    expect(worldRouteRulesMentionsDestination(en)).toBe(false);
  });
});
