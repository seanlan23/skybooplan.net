import { describe, expect, it } from "vitest";
import {
  buildInterestAnchorPayload,
  getInterestAnchor,
  resolveInterestBlueprint,
} from "@/lib/interestAnchors";

function mockTemplate(template: Array<[string, number]>, nDays: number) {
  let day = 1;
  return template.map(([city, fixed]) => {
    const span = fixed > 0 ? fixed : Math.max(2, Math.floor(nDays / template.length));
    const startDay = day;
    const endDay = Math.min(nDays, day + span - 1);
    day = endDay + 1;
    return { city, startDay, endDay };
  });
}

describe("interestAnchors", () => {
  it("returns Thailand beach highlights including Koh Lipe and Phi Phi", () => {
    const anchor = getInterestAnchor("TH", "beaches");
    expect(anchor?.mustIncludeHighlights.some((h) => /phi phi/i.test(h))).toBe(true);
    expect(anchor?.mustIncludeHighlights.some((h) => /koh lipe/i.test(h))).toBe(true);
  });

  it("returns Philippines Boracay, El Nido, and Bohol", () => {
    const anchor = getInterestAnchor("PH", "beaches");
    expect(anchor?.mustIncludeHighlights).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/boracay/i),
        expect.stringMatching(/el nido/i),
        expect.stringMatching(/bohol/i),
        expect.stringMatching(/chocolate hills/i),
      ]),
    );
    expect(anchor?.routeTemplate.some(([city]) => /bohol/i.test(city))).toBe(true);
  });

  it("builds anchor payload for BKK + beaches", () => {
    const payload = buildInterestAnchorPayload("BKK", ["beaches", "sights"]);
    expect(payload?.beaches?.mustIncludeHighlights.length).toBeGreaterThan(2);
    expect(payload?.beaches?.country).toBe("TH");
  });

  it("resolves Thailand blueprint with Koh Lipe and Krabi when beaches selected", () => {
    const blocks = resolveInterestBlueprint(15, "BKK", ["beaches", "sights", "nature"], mockTemplate);
    const cities = blocks?.map((b) => b.city) ?? [];
    expect(cities.some((c) => /krabi/i.test(c))).toBe(true);
    expect(cities.some((c) => /koh lipe/i.test(c))).toBe(true);
  });

  it("returns undefined without beaches priority", () => {
    expect(resolveInterestBlueprint(15, "BKK", ["sights"], mockTemplate)).toBeUndefined();
  });

  it("puts Isla Mujeres first after Cancún on the Mexico beach template", () => {
    const anchor = getInterestAnchor("MX", "beaches");
    expect(anchor?.mustIncludeHighlights.some((h) => /isla mujeres/i.test(h))).toBe(true);
    expect(anchor?.routeTemplate[0]?.[0]).toMatch(/cancún/i);
    expect(anchor?.routeTemplate[1]?.[0]).toMatch(/isla mujeres/i);
    expect(anchor?.steer).toMatch(/takoj po prihodu|čisto na koncu/i);

    const payload = buildInterestAnchorPayload("CUN", ["beaches"]);
    expect(payload?.beaches?.country).toBe("MX");
    expect(payload?.beaches?.routeTemplate.some(([city]) => /isla mujeres/i.test(city))).toBe(
      true,
    );
  });
});
