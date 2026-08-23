import { describe, expect, it } from "vitest";
import { buildCuratedRoutePayload, templateToBlueprintBlocks } from "@/lib/curatedRoutes";
import {
  coastPreludeMinNights,
  ensureLongAccessMinNights,
  findThinStayGaps,
  hubDayTripOnly,
  minStayNights,
  relabelHubDayTripOvernights,
} from "@/lib/stayFacts";

describe("stayFacts catalog", () => {
  it("treats Ayutthaya as a Bangkok day trip", () => {
    expect(hubDayTripOnly("Ayutthaya")?.hubCity).toBe("Bangkok");
    expect(hubDayTripOnly("Bangkok")).toBeNull();
  });

  it("requires 4 nights on Koh Lipe and 3 on Krabi before Lipe", () => {
    expect(minStayNights("Koh Lipe")).toBe(4);
    expect(minStayNights("Krabi")).toBe(1);
    expect(minStayNights("Krabi", "Koh Lipe")).toBe(3);
    expect(coastPreludeMinNights("Krabi", "Koh Lipe")).toBe(3);
    expect(coastPreludeMinNights("Bangkok", "Chiang Mai")).toBe(1);
  });
});

describe("relabelHubDayTripOvernights", () => {
  it("moves Ayutthaya hotel nights back to Bangkok", () => {
    const days = [
      { day: 2, city: "Bangkok", title: "Bangkok" },
      { day: 3, city: "Ayutthaya", title: "Ayutthaya", lat: 14.35, lng: 100.56 },
      { day: 4, city: "Ayutthaya", title: "Ayutthaya" },
      { day: 5, city: "Chiang Mai", title: "Chiang Mai" },
    ];
    expect(relabelHubDayTripOvernights(days, "sl")).toBe(2);
    expect(days[1]!.city).toBe("Bangkok");
    expect(days[1]!.title).toMatch(/Dnevni izlet v Ayutthaya/i);
    expect(days[2]!.city).toBe("Bangkok");
    expect(days[3]!.city).toBe("Chiang Mai");
  });
});

describe("findThinStayGaps", () => {
  it("flags 2-night Lipe and 1-night Krabi prelude without rewriting days", () => {
    const days = [
      { day: 8, city: "Krabi" },
      { day: 9, city: "Koh Lipe" },
      { day: 10, city: "Koh Lipe" },
      { day: 11, city: "Bangkok" },
    ];
    const gaps = findThinStayGaps(days);
    expect(gaps.some((g) => g.kind === "long_access" && /lipe/i.test(g.city))).toBe(true);
    expect(gaps.some((g) => g.kind === "coast_prelude" && /krabi/i.test(g.city))).toBe(true);
    expect(days.map((d) => d.city)).toEqual(["Krabi", "Koh Lipe", "Koh Lipe", "Bangkok"]);
  });
});

describe("ensureLongAccessMinNights", () => {
  it("grows a 2-night Lipe stay without taking Krabi below 3 nights", () => {
    const days = [
      { day: 8, city: "Krabi" },
      { day: 9, city: "Krabi" },
      { day: 10, city: "Krabi" },
      { day: 11, city: "Krabi" },
      { day: 12, city: "Krabi" },
      { day: 13, city: "Koh Lipe" },
      { day: 14, city: "Koh Lipe" },
      { day: 15, city: "Bangkok" },
    ];
    expect(ensureLongAccessMinNights(days)).toBe(2);
    expect(days.filter((d) => /lipe/i.test(d.city ?? "")).map((d) => d.day)).toEqual([
      11, 12, 13, 14,
    ]);
    expect(days.filter((d) => /krabi/i.test(d.city ?? "")).map((d) => d.day)).toEqual([
      8, 9, 10,
    ]);
  });

  it("gives surplus Lipe nights back so Krabi keeps a 3-night prelude", () => {
    const days = [
      { day: 8, city: "Krabi" },
      { day: 9, city: "Koh Lipe" },
      { day: 10, city: "Koh Lipe" },
      { day: 11, city: "Koh Lipe" },
      { day: 12, city: "Koh Lipe" },
      { day: 13, city: "Koh Lipe" },
      { day: 14, city: "Koh Lipe" },
      { day: 15, city: "Koh Lipe" },
      { day: 16, city: "Bangkok" },
    ];
    expect(ensureLongAccessMinNights(days)).toBeGreaterThanOrEqual(2);
    expect(days.filter((d) => /krabi/i.test(d.city ?? "")).map((d) => d.day)).toEqual([
      8, 9, 10,
    ]);
    const lipe = days.filter((d) => /lipe/i.test(d.city ?? "")).map((d) => d.day);
    expect(lipe).toEqual([11, 12, 13, 14, 15]);
  });
});

describe("Thailand blueprint stay facts", () => {
  it("keeps Ayutthaya off the 15-day Andaman stay list and gives Krabi ≥3 and Lipe 4–6", () => {
    const blocks = templateToBlueprintBlocks(
      [
        ["Bangkok", 3],
        ["Chiang Mai", 2],
        ["Krabi", 3],
        ["Koh Lipe", 5],
        ["Bangkok", 2],
      ],
      15,
    );
    expect(blocks.some((b) => /ayutthaya/i.test(b.city))).toBe(false);
    const krabi = blocks.find((b) => /krabi/i.test(b.city));
    const lipe = blocks.find((b) => /lipe/i.test(b.city));
    expect(krabi).toBeTruthy();
    expect(lipe).toBeTruthy();
    expect(krabi!.endDay - krabi!.startDay + 1).toBeGreaterThanOrEqual(3);
    const lipeDays = lipe!.endDay - lipe!.startDay + 1;
    expect(lipeDays).toBeGreaterThanOrEqual(4);
    expect(lipeDays).toBeLessThanOrEqual(6);
  });

  it("on 16 days keeps Krabi ≥3, Lipe 5–6, and first Bangkok ≥3", () => {
    const payload = buildCuratedRoutePayload(16, "BKK", ["beaches"], "koh lipe krabi railay");
    const blocks = payload?.regionBlueprint as
      | Array<{ city: string; startDay: number; endDay: number }>
      | undefined;
    expect(blocks?.some((b) => /ayutthaya/i.test(b.city))).toBe(false);
    const first = blocks?.[0];
    const krabi = blocks?.find((b) => /krabi/i.test(b.city));
    const lipe = blocks?.find((b) => /lipe/i.test(b.city));
    const last = blocks?.at(-1);
    expect(first?.city).toMatch(/bangkok/i);
    expect(first!.endDay - first!.startDay + 1).toBeGreaterThanOrEqual(3);
    expect(krabi!.endDay - krabi!.startDay + 1).toBeGreaterThanOrEqual(3);
    const lipeDays = lipe!.endDay - lipe!.startDay + 1;
    expect(lipeDays).toBeGreaterThanOrEqual(5);
    expect(lipeDays).toBeLessThanOrEqual(6);
    expect(last?.city).toMatch(/bangkok/i);
    expect(last!.endDay - last!.startDay + 1).toBeLessThanOrEqual(2);
  });

  it("drops Koh Lipe from an 8-day Phuket loop that cannot hold 4 nights", () => {
    const blocks = templateToBlueprintBlocks(
      [
        ["Phuket", 4],
        ["Krabi", 0],
        ["Koh Lipe", 4],
        ["Phuket", 2],
      ],
      8,
    );
    expect(blocks.some((b) => /lipe/i.test(b.city))).toBe(false);
    expect(blocks.some((b) => /phuket/i.test(b.city))).toBe(true);
    expect(blocks.at(-1)!.endDay).toBe(8);
  });
});
