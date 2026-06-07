import { describe, expect, it } from "vitest";
import { extractTripIntent, parseMinIslandDays, tripIntentPromptRule } from "@/lib/tripIntent";

describe("extractTripIntent", () => {
  it("parses vietnam + thailand from wishes", () => {
    const intent = extractTripIntent(
      "želim potovanje po vietnamu in tajski. Plan naj bo intenziven, na sanjskih otokih tajske pa sproščeno in najmanj 5 dni",
      { destinationIata: "SGN", returnFromIata: "BKK", pace: "intensive" },
    );
    expect(intent.countries).toContain("VN");
    expect(intent.countries).toContain("TH");
    expect(intent.routeId).toBe("VN_TH");
    expect(intent.minIslandDays).toBe(5);
    expect(intent.islandRelaxPace).toBe(true);
    expect(intent.intensive).toBe(true);
  });

  it("infers countries from open-jaw flights only", () => {
    const intent = extractTripIntent(undefined, {
      destinationIata: "SGN",
      returnFromIata: "BKK",
    });
    expect(intent.routeId).toBe("VN_TH");
  });

  it("detects VN_KH_TH from open-jaw HAN → BKK with Cambodia in wishes", () => {
    const intent = extractTripIntent("vietnam kambodža angkor tajska", {
      destinationIata: "HAN",
      returnFromIata: "BKK",
    });
    expect(intent.routeId).toBe("VN_KH_TH");
  });

  it("detects VN_KH when Cambodia mentioned without Thailand return", () => {
    const intent = extractTripIntent("angkor wat", {
      destinationIata: "HAN",
      returnFromIata: "SGN",
    });
    expect(intent.routeId).toBe("VN_KH");
  });

  it("does not invent VN_TH for same-country flights", () => {
    const intent = extractTripIntent("potovanje po vietnamu", {
      destinationIata: "SGN",
      returnFromIata: "HAN",
    });
    expect(intent.routeId).toBeUndefined();
  });

  it("detects Japan and US from wishes", () => {
    expect(extractTripIntent("Tokyo in potovanje na Havaje").countries).toEqual(
      expect.arrayContaining(["JP", "US"]),
    );
  });

  it("infers country from new phase-1 IATA (AMS)", () => {
    expect(extractTripIntent(undefined, { destinationIata: "AMS" }).countries).toContain("NL");
  });

  it("does not confuse Thai islands with Iceland", () => {
    const intent = extractTripIntent("Thai island hopping, Koh Lipe");
    expect(intent.countries).toContain("TH");
    expect(intent.countries).not.toContain("IS");
  });
});

describe("parseMinIslandDays", () => {
  it("parses najmanj 5 dni", () => {
    expect(parseMinIslandDays("najmanj 5 dni na otokih")).toBe(5);
  });
});

describe("tripIntentPromptRule", () => {
  it("returns Slovenian VN_TH rule", () => {
    const rule = tripIntentPromptRule(
      { countries: ["VN", "TH"], routeId: "VN_TH", minIslandDays: 5 },
      "sl",
    );
    expect(rule).toMatch(/VN\+TH/);
    expect(rule).toMatch(/5 dni/);
  });
});
