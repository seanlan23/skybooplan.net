import { describe, expect, it } from "vitest";
import {
  lastRegionMatchesReturnHub,
  parseMinIslandDaysFromWishes,
  resolveVietnamThailandBlueprint,
} from "@/lib/multiCountryRoutes";
import { extractTripIntent } from "@/lib/tripIntent";

describe("resolveVietnamThailandBlueprint", () => {
  it("builds VN + TH route for SGN arrival and BKK return (17 days)", () => {
    const blocks = resolveVietnamThailandBlueprint(
      17,
      "SGN",
      "BKK",
      extractTripIntent("vietnam in tajska, najmanj 5 dni na otokih", {
        destinationIata: "SGN",
        returnFromIata: "BKK",
      }),
    );
    expect(blocks).toBeDefined();
    const cities = blocks!.map((b) => b.city);
    expect(cities).toContain("Ho Chi Minh City");
    expect(cities).toContain("Phu Quoc");
    expect(cities).toContain("Koh Lipe");
    expect(cities[cities.length - 1]).toBe("Bangkok");
    expect(blocks!.at(-1)!.endDay).toBe(17);
    const lipe = blocks!.find((b) => b.city === "Koh Lipe");
    expect(lipe && lipe.endDay - lipe.startDay + 1).toBeGreaterThanOrEqual(5);
  });

  it("returns undefined for same-country open jaw without wishes", () => {
    expect(resolveVietnamThailandBlueprint(10, "SGN", "HAN")).toBeUndefined();
  });

  it("scales sensibly for 14 days (drops Phu Quoc, 4 island days, keeps Bangkok)", () => {
    const blocks = resolveVietnamThailandBlueprint(
      14,
      "SGN",
      "BKK",
      extractTripIntent("vietnam in tajska, najmanj 5 dni na otokih", {
        destinationIata: "SGN",
        returnFromIata: "BKK",
      }),
    );
    expect(blocks).toBeDefined();
    const cities = blocks!.map((b) => b.city);
    expect(cities).not.toContain("Phu Quoc");
    expect(cities).toContain("Koh Lipe");
    expect(cities[cities.length - 1]).toBe("Bangkok");
    expect(blocks!.at(-1)!.endDay).toBe(14);
    const lipe = blocks!.find((b) => b.city === "Koh Lipe");
    expect(lipe!.endDay - lipe!.startDay + 1).toBe(4);
    const total = blocks!.reduce((s, b) => s + (b.endDay - b.startDay + 1), 0);
    expect(total).toBe(14);
  });

  it("returns undefined below 11 days", () => {
    expect(
      resolveVietnamThailandBlueprint(
        10,
        "SGN",
        "BKK",
        extractTripIntent("vietnam in tajska", { destinationIata: "SGN", returnFromIata: "BKK" }),
      ),
    ).toBeUndefined();
  });

  it("builds route from wishes alone (vietnam + tajska, 17 days)", () => {
    const blocks = resolveVietnamThailandBlueprint(
      17,
      "SGN",
      undefined,
      extractTripIntent("potovanje po vietnamu in tajski za 17 dni", {
        destinationIata: "SGN",
      }),
    );
    expect(blocks).toBeDefined();
    expect(blocks!.map((b) => b.city)).toContain("Koh Lipe");
    expect(blocks!.at(-1)!.city).toBe("Bangkok");
  });
});

describe("parseMinIslandDaysFromWishes", () => {
  it("parses najmanj 5 dni", () => {
    expect(parseMinIslandDaysFromWishes("najmanj 5 dni na otokih")).toBe(5);
  });
});

describe("lastRegionMatchesReturnHub", () => {
  it("accepts Bangkok for BKK return", () => {
    expect(
      lastRegionMatchesReturnHub(
        [{ city: "Bangkok", endDay: 17 }],
        "BKK",
      ),
    ).toBe(true);
  });

  it("rejects Hanoi for BKK return", () => {
    expect(
      lastRegionMatchesReturnHub(
        [{ city: "Hanoi", endDay: 17 }],
        "BKK",
      ),
    ).toBe(false);
  });
});
