import { describe, expect, it } from "vitest";
import {
  buildCuratedRoutePromptBlock,
  lookupCuratedTransportLeg,
  matchCuratedRoute,
  resolveCuratedBlueprint,
} from "@/lib/curatedRoutes";

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

describe("curatedRoutes PH", () => {
  it("matches 11-day Palawan classic (agency pattern)", () => {
    const route = matchCuratedRoute(11, "MNL", ["beaches"], "palawan in port barton");
    expect(route?.id).toBe("ph-palawan-pps-portbarton");
  });

  it("builds Manila → PPS → Port Barton blueprint", () => {
    const blocks = resolveCuratedBlueprint(11, "MNL", mockTemplate, ["beaches"], "honda bay");
    const cities = blocks?.map((b) => b.city) ?? [];
    expect(cities).toEqual(
      expect.arrayContaining(["Manila", "Puerto Princesa", "Port Barton"]),
    );
  });

  it("matches grand tour when Banaue is in wishes", () => {
    const route = matchCuratedRoute(17, "MNL", ["beaches", "nature", "sights"], "banaue riževi terasi");
    expect(route?.id).toBe("ph-luzon-bohol-palawan");
  });

  it("uses real flight leg Manila → Puerto Princesa", () => {
    const leg = lookupCuratedTransportLeg("Manila", "Puerto Princesa", "PH");
    expect(leg?.type).toBe("flight");
    expect(leg?.howTo).toMatch(/MNL.*PPS/i);
    expect(leg?.heavyTravel).toBe(true);
  });

  it("uses van leg Puerto Princesa → Port Barton", () => {
    const leg = lookupCuratedTransportLeg("Puerto Princesa", "Port Barton", "PH");
    expect(leg?.type).toBe("van");
    expect(leg?.howTo).toMatch(/Port Barton/i);
  });

  it("uses flight leg for Manila → Puerto Princesa regardless of country hint", () => {
    expect(lookupCuratedTransportLeg("Manila", "Puerto Princesa", "TH")?.type).toBe("flight");
  });
});

describe("curatedRoutes VN+KH", () => {
  it("matches 14-day Angkor route when Cambodia is in wishes", () => {
    const route = matchCuratedRoute(
      14,
      "HAN",
      ["sights"],
      "vietnam in kambodža angkor",
    );
    expect(route?.id).toBe("vn-kh-angkor-classic");
  });

  it("builds Hanoi → Siem Reap blueprint", () => {
    const blocks = resolveCuratedBlueprint(
      14,
      "HAN",
      mockTemplate,
      ["sights"],
      "cambodia angkor",
    );
    const cities = blocks?.map((b) => b.city) ?? [];
    expect(cities).toEqual(
      expect.arrayContaining([
        "Hanoi",
        "Ha Long Bay",
        "Hue",
        "Hoi An",
        "Ho Chi Minh City",
        "Phnom Penh",
        "Siem Reap",
      ]),
    );
  });

  it("matches grand tour VN+KH+TH when returning from Bangkok", () => {
    const route = matchCuratedRoute(
      18,
      "HAN",
      ["sights", "beaches"],
      "angkor in plaže",
      "BKK",
    );
    expect(route?.id).toBe("vn-kh-th-grand");
  });

  it("uses overnight train Hanoi → Hue", () => {
    const leg = lookupCuratedTransportLeg("Hanoi", "Hue");
    expect(leg?.type).toBe("overnight_train");
    expect(leg?.heavyTravel).toBe(true);
  });

  it("uses flight Hoi An → Ho Chi Minh via Danang", () => {
    const leg = lookupCuratedTransportLeg("Hoi An", "Ho Chi Minh City");
    expect(leg?.type).toBe("flight");
    expect(leg?.howTo).toMatch(/DAD/i);
  });
});

describe("curatedRoutes TH", () => {
  it("matches 9-day short circle without island", () => {
    const route = matchCuratedRoute(9, "BKK", ["sights"], "kanchanaburi chiang mai");
    expect(route?.id).toBe("th-classic-short");
    expect(route?.segments.some(([c]) => /samet/i.test(c))).toBe(false);
  });

  it("matches 12-day classic circle from agency (Kanchanaburi + Ko Samet)", () => {
    const route = matchCuratedRoute(12, "BKK", ["sights"], "kanchanaburi in ko samet");
    expect(route?.id).toBe("th-classic-circle");
  });

  it("builds Bangkok → Chiang Mai → Ko Samet blueprint", () => {
    const blocks = resolveCuratedBlueprint(
      12,
      "BKK",
      mockTemplate,
      ["sights"],
      "erawan kwai",
    );
    const cities = blocks?.map((b) => b.city) ?? [];
    expect(cities).toEqual(
      expect.arrayContaining(["Bangkok", "Kanchanaburi", "Chiang Mai", "Ko Samet"]),
    );
  });

  it("matches Andaman route when Koh Lipe is in wishes", () => {
    const route = matchCuratedRoute(15, "BKK", ["beaches"], "koh lipe in krabi");
    expect(route?.id).toBe("th-beaches-andaman");
  });

  it("uses train Bangkok → Kanchanaburi", () => {
    const leg = lookupCuratedTransportLeg("Bangkok", "Kanchanaburi");
    expect(leg?.type).toBe("train");
  });

  it("uses Pakbara ferry Krabi → Koh Lipe", () => {
    const leg = lookupCuratedTransportLeg("Krabi", "Koh Lipe", "TH");
    expect(leg?.type).toBe("ferry");
    expect(leg?.howTo).toMatch(/Pakbara/i);
  });
});

describe("curatedRoutes ID", () => {
  it("matches 16-day grand circle (Toraja + Komodo)", () => {
    const route = matchCuratedRoute(16, "CGK", ["sights", "nature"], "toraja komodo wae rebo");
    expect(route?.id).toBe("id-grand-circle");
  });

  it("builds Jakarta → Toraja → Ubud → Labuan Bajo blueprint", () => {
    const blocks = resolveCuratedBlueprint(
      16,
      "CGK",
      mockTemplate,
      ["nature", "sights"],
      "flores komodo",
    );
    const cities = blocks?.map((b) => b.city) ?? [];
    expect(cities).toEqual(
      expect.arrayContaining(["Jakarta", "Tana Toraja", "Ubud", "Labuan Bajo"]),
    );
  });

  it("uses flight Bali → Labuan Bajo", () => {
    const leg = lookupCuratedTransportLeg("Ubud", "Labuan Bajo");
    expect(leg?.type).toBe("flight");
    expect(leg?.howTo).toMatch(/LBJ/i);
  });
});

describe("curatedRoutes global defaults", () => {
  it("buildCuratedRoutePromptBlock limits Bangkok stretch on 12d TH", () => {
    const block = buildCuratedRoutePromptBlock({
      nDays: 12,
      destinationIata: "BKK",
      priorities: ["sights"],
      wishes: "templji tajska",
    });
    expect(block).toMatch(/KURIRANA POT/i);
    expect(block).toMatch(/Chiang Mai|Kanchanaburi|Krabi/i);
    expect(block).toMatch(/Dan 1–[23]: Bangkok/i);
    expect(block).not.toMatch(/Dan 1–[5-9]: Bangkok/i);
  });

  it("buildCuratedRoutePromptBlock covers Vietnam north-south", () => {
    const block = buildCuratedRoutePromptBlock({
      nDays: 10,
      destinationIata: "HAN",
      priorities: ["sights"],
      wishes: "vietnam",
    });
    expect(block).toMatch(/Hanoi/i);
    expect(block).toMatch(/Hoi An|Ho Chi Minh/i);
  });

  it("buildCuratedRoutePromptBlock covers Manila hub routes", () => {
    const block = buildCuratedRoutePromptBlock({
      nDays: 10,
      destinationIata: "MNL",
      priorities: ["beaches"],
      wishes: "filipini",
    });
    expect(block).toMatch(/Manila/i);
    expect(block).toMatch(/Puerto Princesa|El Nido|Palawan/i);
  });

  it("resolves Italy hub route for FCO", () => {
    const route = matchCuratedRoute(12, "FCO", ["sights"], "italija");
    expect(route?.id).toMatch(/hub-fco|it/i);
    expect(route?.segments.some(([c]) => /rome|florence/i.test(c))).toBe(true);
  });

  it("resolves Indonesia beaches default", () => {
    const route = matchCuratedRoute(14, "DPS", ["beaches"], "bali gili");
    expect(route?.country).toBe("ID");
    expect(route?.segments.some(([c]) => /ubud|bali|gili/i.test(c))).toBe(true);
  });
});
