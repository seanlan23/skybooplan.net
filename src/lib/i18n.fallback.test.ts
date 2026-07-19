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

  it("normalizeAppLang keeps allowed locales and maps unknown to en", () => {
    expect(normalizeAppLang("de")).toBe("de");
    expect(normalizeAppLang("fr")).toBe("fr");
    expect(normalizeAppLang("sl")).toBe("sl");
    expect(normalizeAppLang("en")).toBe("en");
    expect(normalizeAppLang("zh")).toBe("en");
    expect(normalizeAppLang("xx")).toBe("en");
  });

  it("never returns raw key for core homepage strings", () => {
    for (const lang of SUPPORTED_LANGS) {
      expect(translate(lang, "hero.title.c")).not.toBe("hero.title.c");
      expect(translate(lang, "hero.chatHeadline")).not.toBe("hero.chatHeadline");
      expect(translate(lang, "faq.title")).not.toBe("faq.title");
      expect(translate(lang, "paywall.unlockPlanCta").trim().length).toBeGreaterThan(10);
    }
  });

  it("fr homepage strings are French, not Slovenian", () => {
    expect(translate("fr", "hero.chatHeadline")).toContain("voyage");
    expect(translate("fr", "hero.cta")).toBe("Rechercher →");
    expect(translate("fr", "faq.title")).toBe("Questions fréquentes");
  });

  it("de never falls back to Slovenian for untranslated keys", () => {
    expect(translate("de", "error.networkFetch")).not.toBe("Težava s povezavo");
    expect(translate("de", "error.networkFetch")).toMatch(/connection|server/i);
  });

  it("de shell UI is German (not English fallback)", () => {
    expect(translate("de", "nav.flights")).toBe("Flüge");
    expect(translate("de", "nav.stays")).toBe("Unterkünfte");
    expect(translate("de", "nav.ai")).toBe("KI-Planer");
    expect(translate("de", "nav.signIn")).toBe("Anmelden");
    expect(translate("de", "heroMode.flights")).toContain("Flüge");
    expect(translate("de", "heroChat.checklist.title")).toContain("Reise");
    expect(translate("de", "results.cheapestBadge")).toBe("Günstigste");
    expect(translate("de", "results.selectAiPlan")).toContain("KI");
    expect(translate("de", "aiplan.yourChoices")).toBe("Deine Einstellungen");
    expect(translate("de", "aiplan.paceChip")).toBe("Tempo: {pace}");
    expect(translate("de", "travelReq.vaccinations")).toContain("Impfungen");
  });
});
