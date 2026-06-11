import { describe, it, expect } from "vitest";
import {
  normalizeAppLang,
  translate,
  translationFallbackChain,
  SUPPORTED_LANGS,
} from "@/lib/i18n";

describe("i18n strict fallback", () => {
  it("supports only six UI languages", () => {
    expect(SUPPORTED_LANGS).toEqual(["sl", "en", "es", "fr", "it", "de"]);
  });

  it("de uses German plan UI then English — never Slovenian", () => {
    expect(translationFallbackChain("de")).toEqual(["de", "en"]);
    expect(translate("de", "aiplan.day")).toBe("Tag");
    expect(translate("de", "poi.moreInfo")).toBe("Mehr Infos");
    expect(translate("de", "tab.flights")).toBe("Flüge");
  });

  it("sl prefers Slovenian with English fallback", () => {
    expect(translationFallbackChain("sl")).toEqual(["sl", "en"]);
    expect(translate("sl", "nav.signIn")).toBe("Prijava");
    expect(translate("sl", "aiplan.day")).toBe("Dan");
    expect(translate("sl", "poi.moreInfo")).toBe("Več informacij");
  });

  it("es uses Spanish plan labels", () => {
    expect(translate("es", "aiplan.day")).toBe("Día");
    expect(translate("es", "poi.moreInfo")).toBe("Más información");
  });

  it("normalizeAppLang keeps allowed locales and maps unknown to sl", () => {
    expect(normalizeAppLang("de")).toBe("de");
    expect(normalizeAppLang("fr")).toBe("fr");
    expect(normalizeAppLang("sl")).toBe("sl");
    expect(normalizeAppLang("en")).toBe("en");
    expect(normalizeAppLang("zh")).toBe("sl");
    expect(normalizeAppLang("xx")).toBe("sl");
  });

  it("never returns raw key for core homepage strings", () => {
    for (const lang of SUPPORTED_LANGS) {
      expect(translate(lang, "hero.title.c")).not.toBe("hero.title.c");
      expect(translate(lang, "paywall.unlockPlanCta").trim().length).toBeGreaterThan(10);
    }
  });
});
