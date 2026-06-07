import { describe, expect, it } from "vitest";
import { enrichDayActivities, eveningVenueKey } from "@/lib/dayEnrichers";
import { resolveTripLocale } from "@/lib/tripLocale";

describe("Zanzibar evening enricher", () => {
  const locale = resolveTripLocale("ZNZ", "Zanzibar", "sl");

  it("fills Stone Town evening even when Forodhani is afternoon", () => {
    const used = new Set<string>();
    const out = enrichDayActivities(
      {
        morning: [{ name: "Stone Town", type: "SIGHT", description: "Sprehod." }],
        afternoon: [
          {
            name: "Forodhani Market",
            type: "SIGHT",
            description: "Popoldanski ogled tržnice.",
          },
        ],
        evening: [],
      },
      "Zanzibar",
      2,
      locale,
      { destinationIata: "ZNZ", dayHighlightNames: ["Stone Town", "Forodhani Market"], usedEveningVenues: used },
    );
    expect(out.evening.length).toBeGreaterThan(0);
    expect(out.evening[0]!.name).toMatch(/forodhani|stone town/i);
  });

  it("does not repeat The Rock on consecutive east-coast days", () => {
    const used = new Set<string>();
    const day1 = enrichDayActivities(
      {
        morning: [],
        afternoon: [{ name: "Jozani Forest", type: "SIGHT", description: "Opice." }],
        evening: [],
      },
      "Zanzibar",
      3,
      locale,
      { destinationIata: "ZNZ", dayHighlightNames: ["Jozani Forest"], usedEveningVenues: used },
    );
    const day2 = enrichDayActivities(
      {
        morning: [],
        afternoon: [{ name: "Paje Beach", type: "ACTIVITY", description: "Plaža." }],
        evening: [],
      },
      "Zanzibar",
      4,
      locale,
      { destinationIata: "ZNZ", dayHighlightNames: ["Paje Beach"], usedEveningVenues: used },
    );
    expect(day1.evening[0]!.name).toMatch(/rock/i);
    expect(day2.evening[0]!.name).not.toMatch(/rock/i);
  });

  it("fills Kizimkazi evening when afternoon mentions dolphins", () => {
    const out = enrichDayActivities(
      {
        morning: [],
        afternoon: [{ name: "Kizimkazi Dolphins", type: "ACTIVITY", description: "Delfini." }],
        evening: [],
      },
      "Zanzibar",
      5,
      locale,
      { destinationIata: "ZNZ", dayHighlightNames: ["Kizimkazi Dolphins"], usedEveningVenues: new Set() },
    );
    expect(out.evening.length).toBe(1);
    expect(out.evening[0]!.name.toLowerCase()).toMatch(/kizimkazi|južn|plazi/);
  });
});

describe("eveningVenueKey", () => {
  it("normalizes The Rock for dedup", () => {
    expect(eveningVenueKey("The Rock Restaurant (Pingwe)")).toBe("the-rock");
  });
});
