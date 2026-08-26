import { describe, expect, it } from "vitest";
import {
  buildCuratedRoutePayload,
  buildCuratedRoutePromptBlock,
  lookupCuratedTransportLeg,
  matchCuratedRoute,
  resolveCuratedBlueprint,
  templateToBlueprintBlocks,
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

  it("does not dump leftover days into final Manila on 22-day beach trip", () => {
    const payload = buildCuratedRoutePayload(22, "MNL", ["beaches"], "filipini plaže sproščeno");
    const blocks = payload?.regionBlueprint as
      | Array<{ city: string; startDay: number; endDay: number }>
      | undefined;
    expect(blocks?.length).toBeGreaterThanOrEqual(3);

    const manilaSpans = (blocks ?? [])
      .filter((b) => /manila/i.test(b.city))
      .map((b) => b.endDay - b.startDay + 1);
    expect(Math.max(...manilaSpans)).toBeLessThanOrEqual(3);

    const islandDays = (blocks ?? [])
      .filter((b) => !/manila/i.test(b.city))
      .reduce((sum, b) => sum + (b.endDay - b.startDay + 1), 0);
    expect(islandDays).toBeGreaterThanOrEqual(16);
  });

  it("templateToBlueprintBlocks keeps return Manila at ≤2–3 days when scaling 28d Palawan", () => {
    const blocks = templateToBlueprintBlocks(
      [
        ["Manila", 1],
        ["Puerto Princesa", 0],
        ["Port Barton", 0],
        ["Manila", 2],
      ],
      28,
    );
    const last = blocks[blocks.length - 1]!;
    expect(last.city).toBe("Manila");
    expect(last.endDay - last.startDay + 1).toBeLessThanOrEqual(3);
    expect(last.endDay).toBe(28);
    const pps = blocks.find((b) => /puerto/i.test(b.city))!;
    expect(pps.endDay - pps.startDay + 1).toBeGreaterThanOrEqual(8);
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

  it("starts on Phuket when international arrival is HKT", () => {
    const route = matchCuratedRoute(16, "HKT", ["beaches"], "phuket sproščeno");
    expect(route?.id).toBe("th-phuket-andaman");
    expect(route?.segments[0]?.[0]).toBe("Phuket");
    expect(route?.segments.some(([c]) => c === "Bangkok")).toBe(false);
  });

  it("prompt for HKT forbids day-1 hop to Bangkok", () => {
    const block = buildCuratedRoutePromptBlock({
      nDays: 16,
      destinationIata: "HKT",
      priorities: ["beaches"],
      wishes: "phuket",
    });
    expect(block).toMatch(/HKT/);
    expect(block).toMatch(/Phuket/);
    expect(block).toMatch(/Prepovedano: notranji let/i);
  });

  it("starts in Chiang Mai when arrival is CNX", () => {
    const route = matchCuratedRoute(12, "CNX", ["sights"], "chiang mai");
    expect(route?.id).toBe("th-chiangmai-north");
    expect(route?.segments[0]?.[0]).toBe("Chiang Mai");
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

  it("uses Pak Bara + HDY route for Koh Lipe → Phuket", () => {
    const leg = lookupCuratedTransportLeg("Koh Lipe", "Phuket", "TH");
    expect(leg?.type).toBe("ferry+flight");
    expect(leg?.howTo).toMatch(/Pak Bara|HDY/i);
    expect(leg?.howTo).toMatch(/Ni neposrednega leta/i);
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
    expect(block).toMatch(/PREDLOG POTI|KURIRANA POT/i);
    expect(block).toMatch(/Chiang Mai|Kanchanaburi|Krabi/i);
    expect(block).toMatch(/Dan 1–[23]: Bangkok/i);
    expect(block).not.toMatch(/Dan 1–[5-9]: Bangkok/i);
  });

  it("defaults 15-day BKK arrivals to north + coast, not a Bangkok week", () => {
    const route = matchCuratedRoute(15, "BKK", ["sights"], "sproščeno templji");
    expect(route?.id).toBe("th-classic-long");
    const block = buildCuratedRoutePromptBlock({
      nDays: 15,
      destinationIata: "BKK",
      priorities: ["sights"],
      wishes: "sproščeno templji",
    });
    expect(block).toMatch(/PREDLOG POTI/i);
    expect(block).toMatch(/Chiang Mai/i);
    expect(block).toMatch(/Dan 1–[34]: Bangkok/i);
    expect(block).not.toMatch(/Dan 1–[5-9]: Bangkok/i);
    expect(block).toMatch(/PREPOVEDANO 7 noči/i);
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

describe("curatedRoutes BW / NA safari", () => {
  it("matches Botswana classic for GBE", () => {
    const route = matchCuratedRoute(16, "GBE", ["nature", "sights"], "botswana safari");
    expect(route?.id).toBe("bw-classic-delta-chobe");
  });

  it("does not dump leftover days into final Gaborone on 16-day trip", () => {
    const payload = buildCuratedRoutePayload(16, "GBE", ["nature"], "botswana okavango chobe");
    const blocks = payload?.regionBlueprint as
      | Array<{ city: string; startDay: number; endDay: number }>
      | undefined;
    expect(blocks?.length).toBeGreaterThanOrEqual(4);

    const gaboroneSpans = (blocks ?? [])
      .filter((b) => /gaborone/i.test(b.city))
      .map((b) => b.endDay - b.startDay + 1);
    expect(Math.max(...gaboroneSpans)).toBeLessThanOrEqual(2);

    const wildernessDays = (blocks ?? [])
      .filter((b) => !/gaborone/i.test(b.city))
      .reduce((sum, b) => sum + (b.endDay - b.startDay + 1), 0);
    expect(wildernessDays).toBeGreaterThanOrEqual(12);
  });

  it("matches Namibia classic for WDH", () => {
    const route = matchCuratedRoute(16, "WDH", ["nature"], "namibia etosha sossusvlei");
    expect(route?.id).toBe("na-classic-loop");
  });

  it("keeps return Windhoek thin and grows Etosha/Sesriem on 16d loop", () => {
    const blocks = templateToBlueprintBlocks(
      [
        ["Windhoek", 1],
        ["Sesriem", 0],
        ["Swakopmund", 0],
        ["Damaraland", 0],
        ["Etosha", 0],
        ["Windhoek", 1],
      ],
      16,
    );
    const last = blocks[blocks.length - 1]!;
    expect(last.city).toMatch(/windhoek/i);
    expect(last.endDay - last.startDay + 1).toBeLessThanOrEqual(2);

    const etosha = blocks.find((b) => /etosha/i.test(b.city));
    expect(etosha).toBeTruthy();
    expect((etosha!.endDay - etosha!.startDay + 1)).toBeGreaterThanOrEqual(3);
  });

  it("matches Johannesburg Kruger route for JNB", () => {
    const route = matchCuratedRoute(10, "JNB", ["nature"], "kruger safari");
    expect(route?.id).toBe("za-jnb-kruger");
  });

  it("does not dump leftover days into Johannesburg on 12-day Kruger trip", () => {
    const payload = buildCuratedRoutePayload(12, "JNB", ["nature"], "kruger");
    const blocks = payload?.regionBlueprint as
      | Array<{ city: string; startDay: number; endDay: number }>
      | undefined;
    const jnbSpans = (blocks ?? [])
      .filter((b) => /johannesburg/i.test(b.city))
      .map((b) => b.endDay - b.startDay + 1);
    expect(Math.max(...jnbSpans)).toBeLessThanOrEqual(2);
    const krugerDays = (blocks ?? [])
      .filter((b) => /kruger/i.test(b.city))
      .reduce((sum, b) => sum + (b.endDay - b.startDay + 1), 0);
    expect(krugerDays).toBeGreaterThanOrEqual(8);
  });

  it("matches Kenya Mara route for NBO", () => {
    const route = matchCuratedRoute(12, "NBO", ["nature"], "maasai mara amboseli");
    expect(route?.id).toBe("ke-classic-mara");
  });

  it("keeps Nairobi thin and grows Mara on 14d Kenya trip", () => {
    const payload = buildCuratedRoutePayload(14, "NBO", ["nature"], "kenya safari");
    const blocks = payload?.regionBlueprint as
      | Array<{ city: string; startDay: number; endDay: number }>
      | undefined;
    const nairobiSpans = (blocks ?? [])
      .filter((b) => /nairobi/i.test(b.city))
      .map((b) => b.endDay - b.startDay + 1);
    expect(Math.max(...nairobiSpans)).toBeLessThanOrEqual(2);
    const wilderness = (blocks ?? [])
      .filter((b) => !/nairobi/i.test(b.city))
      .reduce((sum, b) => sum + (b.endDay - b.startDay + 1), 0);
    expect(wilderness).toBeGreaterThanOrEqual(10);
  });
});
