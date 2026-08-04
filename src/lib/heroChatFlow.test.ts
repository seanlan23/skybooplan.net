import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n";
import {
  HERO_DESTINATION_CHIPS,
  buildHeroMakeSearchQuery,
  buildHeroSearchQuery,
  getDestinationChipDisplay,
  localizeDestinationDisplay,
  localizeHeroCollectedForUi,
  localizeWishesDisplay,
} from "@/lib/heroChatFlow";

describe("getDestinationChipDisplay", () => {
  it("returns Slovenian names when lang is sl", () => {
    const paris = HERO_DESTINATION_CHIPS.find((c) => c.id === "paris")!;
    const display = getDestinationChipDisplay(paris, (key) => translate("sl", key as never));
    expect(display.emoji).toBe("🗼");
    expect(display.name).toBe("Pariz");
    expect(display.label).toBe("🗼 Pariz");
  });

  it("returns English names when lang is en", () => {
    const japan = HERO_DESTINATION_CHIPS.find((c) => c.id === "japan")!;
    const display = getDestinationChipDisplay(japan, (key) => translate("en", key as never));
    expect(display.name).toBe("Japan");
    expect(display.label).toBe("🏯 Japan");
  });

  it("localizes stored English chip destination for checklist", () => {
    expect(
      localizeDestinationDisplay("Thailand", (key) => translate("sl", key as never)),
    ).toBe("Tajska");
    expect(
      localizeDestinationDisplay("Paris", (key) => translate("sl", key as never)),
    ).toBe("Pariz");
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
        pace: "",
        budget: "",
      },
      "all",
    );

    expect(query).toContain("Tajska");
    expect(query).toContain("Konec oktobra");
    expect(query).toContain("2 odrasla");
    expect(query).not.toContain("proračun");
  });

  it("localizes English chip destination + Munich origin for SL wishes/query", () => {
    const t = (key: string) => translate("sl", key as never);
    const localized = localizeHeroCollectedForUi(
      {
        destination: "Thailand",
        dates: "Oktober–november",
        nights: "",
        origin: "Munich (MUC)",
        passengers: "2 odrasla",
        pace: "Sproščen",
        budget: "500–1000€ / osebo",
      },
      "sl",
      t,
    );
    const query = buildHeroMakeSearchQuery(localized, "all");
    expect(query).toContain("Tajska");
    expect(query).toContain("München (MUC)");
    expect(query).not.toMatch(/\bThailand\b/);
    expect(query).not.toMatch(/\bMunich\b/);
  });

  it("includes locationWishes in the Make/plan query string", () => {
    const query = buildHeroMakeSearchQuery(
      {
        destination: "Thailand",
        dates: "Konec oktobra",
        nights: "",
        origin: "Ljubljana",
        passengers: "2 odrasla",
        pace: "Sproščen",
        budget: "1000–2000€ / osebo",
        locationWishes: "Chiang Mai in Phuket",
      },
      "all",
    );
    expect(query).toContain("Želje / must visit: Chiang Mai in Phuket");
  });
});

describe("localizeWishesDisplay", () => {
  it("rewrites stored English wishes for Slovenian UI", () => {
    const out = localizeWishesDisplay(
      "Potovanje v Thailand, termin Oktober–november, iz Munich (MUC), tempo Sproščen",
      "sl",
      (key) => translate("sl", key as never),
    );
    expect(out).toContain("Tajska");
    expect(out).toContain("München (MUC)");
    expect(out).not.toMatch(/\bThailand\b/);
    expect(out).not.toMatch(/\bMunich\b/);
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
      pace: "Sproščen",
      budget: "500–1000€",
    });

    expect(query).toContain("New York");
    expect(query).toContain("Julij 2027");
    expect(query).toContain("Ljubljana");
    expect(query).toContain("2 odrasla");
  });
});
