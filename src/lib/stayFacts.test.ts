import { describe, expect, it } from "vitest";
import { templateToBlueprintBlocks } from "@/lib/curatedRoutes";
import {
  ensureLongAccessMinNights,
  hubDayTripOnly,
  minStayNights,
  relabelHubDayTripOvernights,
} from "@/lib/stayFacts";

describe("stayFacts catalog", () => {
  it("treats Ayutthaya as a Bangkok day trip", () => {
    expect(hubDayTripOnly("Ayutthaya")?.hubCity).toBe("Bangkok");
    expect(hubDayTripOnly("Bangkok")).toBeNull();
  });

  it("requires 4 nights on Koh Lipe", () => {
    expect(minStayNights("Koh Lipe")).toBe(4);
    expect(minStayNights("Krabi")).toBe(1);
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

describe("ensureLongAccessMinNights", () => {
  it("grows a 2-night Lipe stay to 4 from the previous coast base", () => {
    const days = [
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
    expect(days[0]!.city).toBe("Krabi");
  });
});

describe("Thailand blueprint stay facts", () => {
  it("keeps Ayutthaya off the 15-day Andaman stay list and gives Lipe ≥4 nights", () => {
    const blocks = templateToBlueprintBlocks(
      [
        ["Bangkok", 2],
        ["Chiang Mai", 2],
        ["Krabi", 0],
        ["Koh Lipe", 4],
        ["Bangkok", 2],
      ],
      15,
    );
    expect(blocks.some((b) => /ayutthaya/i.test(b.city))).toBe(false);
    const lipe = blocks.find((b) => /lipe/i.test(b.city));
    expect(lipe).toBeTruthy();
    expect(lipe!.endDay - lipe!.startDay + 1).toBeGreaterThanOrEqual(4);
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
