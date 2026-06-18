import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n";
import {
  HERO_DESTINATION_CHIPS,
  buildHeroMakeSearchQuery,
  buildHeroSearchQuery,
  getDestinationChipDisplay,
} from "@/lib/heroChatFlow";

describe("getDestinationChipDisplay", () => {
  it("returns Slovenian names when lang is sl", () => {
    const paris = HERO_DESTINATION_CHIPS[0]!;
    const display = getDestinationChipDisplay(paris, (key) => translate("sl", key as never));
    expect(display.emoji).toBe("🗼");
    expect(display.name).toBe("Pariz");
    expect(display.label).toBe("🗼 Pariz");
  });

  it("returns English names when lang is en", () => {
    const japan = HERO_DESTINATION_CHIPS[4]!;
    const display = getDestinationChipDisplay(japan, (key) => translate("en", key as never));
    expect(display.name).toBe("Japan");
    expect(display.label).toBe("🏯 Japan");
  });
});

describe("buildHeroMakeSearchQuery", () => {
  it("builds a query from destination, dates, and passengers only", () => {
    const query = buildHeroMakeSearchQuery(
      {
        destination: "Tajska",
        dates: "Konec oktobra",
        nights: "",
        origin: "",
        passengers: "2 odrasla, 1 otrok",
        budget: "",
      },
      "all",
    );

    expect(query).toContain("Tajska");
    expect(query).toContain("Konec oktobra");
    expect(query).toContain("2 odrasla");
    expect(query).not.toContain("proračun");
  });
});

describe("buildHeroSearchQuery", () => {
  it("combines collected chat fields into a natural-language search query", () => {
    const query = buildHeroSearchQuery({
      destination: "New York",
      dates: "Julij 2027",
      nights: "7 noči",
      origin: "Ljubljana",
      passengers: "2 odrasla",
      budget: "500–1000€",
    });

    expect(query).toContain("New York");
    expect(query).toContain("Julij 2027");
    expect(query).toContain("Ljubljana");
    expect(query).toContain("2 odrasla");
  });
});
