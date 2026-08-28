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
    expect(sl).toMatch(/tranzitna metropola|≤30 %/i);
    expect(en).toMatch(/transit metropolis|≤30%/i);
    expect(sl).toMatch(/zapuščeno regijo|En premik med dvema bazama/i);
    expect(sl).toMatch(/naslednji dan je samo nova baza|brez ponovljenega A→B/i);
    expect(sl).toMatch(/Zadnji koledarski dan|IATA/i);
    expect(en).toMatch(/Last calendar day|IATA city/i);
    expect(sl).toMatch(/votli naslovi|10\+ ur/i);
    expect(sl).toMatch(/prosti \/ lokalni dan|Izlet na otok/i);
    expect(en).toMatch(/origin international departure|boarding-pass/i);
    expect(sl).toMatch(/POI/i);
    expect(sl).toMatch(/Dve oddaljeni državi|en dan samo prevoz/i);
    expect(en).toMatch(/Bases first/i);
    expect(sl).toMatch(/Otok ob prihodnem letališču|kratek trajekt/i);
    expect(en).toMatch(/short-ferry island|mainland coastal drive/i);
    expect(worldRouteRulesMentionsDestination(sl)).toBe(false);
    expect(worldRouteRulesMentionsDestination(en)).toBe(false);
  });
});
