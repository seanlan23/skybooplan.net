import { describe, expect, it } from "vitest";
import { enrichDayActivities } from "@/lib/dayEnrichers";
import { fixSlotTimeMismatch } from "@/lib/textSanitize";
import { resolveTripLocale } from "@/lib/tripLocale";

const locale = resolveTripLocale("HAN", "Vietnam", "sl");

describe("enrichDayActivities Vietnam", () => {
  it("moves Bia Hoi to evening and adds Hoan Kiem afternoon on Hanoi return from Ha Long", () => {
    const out = enrichDayActivities(
      {
        morning: [
          {
            name: "Prevoz: Ha Long Bay → Hanoi",
            type: "TRANSPORT",
            description: "Transfer s križarke.",
          },
        ],
        afternoon: [
          {
            name: "Bia Hoi Junction",
            type: "EAT",
            description: "Pivska ulica — popoldanski sprehod.",
          },
        ],
        evening: [],
      },
      "Hanoi",
      1,
      locale,
      {
        priorScheduledText: "Ha Long Bay križarka dan 13",
        isArrivalDay: true,
      },
    );
    expect(out.afternoon.some((a) => /hoan kiem|ngoc son/i.test(a.name))).toBe(true);
    expect(out.afternoon.some((a) => /bia hoi/i.test(a.name))).toBe(false);
    expect(out.evening.some((a) => /bia hoi/i.test(a.name))).toBe(true);
    expect(out.evening.some((a) => /old quarter|stara četrt/i.test(a.name))).toBe(false);
  });

  it("does not duplicate Old Quarter when Bia Hoi is scheduled on Hanoi return", () => {
    const out = enrichDayActivities(
      {
        morning: [{ name: "Prevoz", type: "TRANSPORT", description: "Ha Long → Hanoi" }],
        afternoon: [],
        evening: [],
      },
      "Hanoi",
      1,
      locale,
      {
        priorScheduledText: "Ha Long Bay cruise",
        isArrivalDay: true,
      },
    );
    const eveningNames = out.evening.map((a) => a.name).join(" ");
    expect(eveningNames).toMatch(/bia hoi/i);
    expect(eveningNames).not.toMatch(/old quarter|stara četrt/i);
    expect(out.evening.length).toBeLessThanOrEqual(2);
  });

  it("moves Nguyen Hue with evening copy out of morning", () => {
    const out = enrichDayActivities(
      {
        morning: [
          {
            name: "Nguyen Hue Walking Street",
            type: "SIGHT",
            description: "Živahna pešcona — idealna za prvi večerni sprehod.",
          },
        ],
        afternoon: [],
        evening: [],
      },
      "Ho Chi Minh City",
      3,
      locale,
      { isTripDay1: false, isArrivalDay: false },
    );
    expect(out.morning.some((a) => /nguyen hue/i.test(a.name))).toBe(false);
    expect(out.evening.some((a) => /nguyen hue/i.test(a.name))).toBe(true);
  });

  it("replaces Ben Thanh + Bitexco afternoon on HCMC day 3 with Cafe Apartments", () => {
    const out = enrichDayActivities(
      {
        morning: [{ name: "War Remnants Museum", type: "SIGHT", description: "Zgodovina." }],
        afternoon: [
          {
            name: "Ben Thanh Market",
            type: "SIGHT",
            description: "Prvi stik z vietnamsko kulinariko PO PRIHODU.",
          },
          {
            name: "Bitexco Financial Tower Skydeck",
            type: "SIGHT",
            description: "Razgledna ploščad.",
          },
        ],
        evening: [{ name: "Lokalna večerja", type: "EAT", description: "Pho." }],
      },
      "Ho Chi Minh City",
      3,
      locale,
      { isTripDay1: false, isArrivalDay: false },
    );
    expect(out.afternoon.some((a) => /cafe apartments|nguyen hue/i.test(a.name))).toBe(true);
    expect(out.afternoon.some((a) => /ben thanh|bitexco/i.test(a.name))).toBe(false);
    expect(out.afternoon[0]!.description).not.toMatch(/po prihodu|prvi stik/i);
  });

  it("swaps An Bang beach for indoor backup in Hoi An during September", () => {
    const out = enrichDayActivities(
      {
        morning: [],
        afternoon: [
          {
            name: "An Bang Beach",
            type: "BEACH",
            description: "Sproščen dan poležavanja na plaži.",
          },
        ],
        evening: [],
      },
      "Hoi An",
      2,
      locale,
      { tripDate: "2026-09-15" },
    );
    expect(out.afternoon.some((a) => /an bang|beach/i.test(a.name))).toBe(false);
    expect(out.afternoon.some((a) => /kuharski|lantern|lampion/i.test(a.name))).toBe(true);
  });
});

describe("fixSlotTimeMismatch Vietnam", () => {
  it("rewrites evening stroll text in morning slot", () => {
    const out = fixSlotTimeMismatch(
      "Živahna pešcona — idealna za prvi večerni sprehod.",
      "morning",
      "Nguyen Hue Walking Street",
    );
    expect(out).not.toMatch(/večern/i);
    expect(out).toMatch(/dopoldan/i);
  });
});
