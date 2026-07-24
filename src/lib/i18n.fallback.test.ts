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

  it("es/fr/it/de homepage shell never falls back to English for marketing keys", () => {
    const keys = [
      "heroChat.guided.whereTitle",
      "heroChat.guided.typeOwn",
      "heroChat.feature.itinerary",
      "heroChat.feature.flights",
      "heroChat.feature.pdf",
      "inspiration.paris.title",
      "inspiration.croatia.title",
      "inspiration.asia.title",
      "testimonials.title",
      "donation.title",
      "donation.contact",
      "support.title",
      "support.amountCustom",
      "feat.itin.title",
      "feat.flights.title",
      "feat.pdf.title",
      "feat.free.title",
      "footer.company",
      "footer.legal",
      "footer.about",
      "footer.terms",
      "footer.disclaimerTitle",
      "hero.chip.thailand.name",
      "hero.chip.paris.name",
    ] as const;

    const mustNotMatchEn = {
      "heroChat.guided.whereTitle": "Where do you want to go?",
      "heroChat.guided.typeOwn": "I want somewhere else",
      "heroChat.feature.itinerary": "🗺️ AI itinerary",
      "inspiration.paris.title": "Romantic Paris",
      "testimonials.title": "What travelers say",
      "donation.title": "Support Skybooplan",
      "support.title": "Did Skybooplan make planning easier? 🌍",
      "feat.itin.title": "AI itinerary + map",
      "footer.company": "Company",
      "footer.about": "About",
    } as const;

    for (const lang of ["es", "fr", "it", "de"] as const) {
      for (const key of keys) {
        const value = translate(lang, key);
        expect(value).not.toBe(key);
        expect(value.trim().length).toBeGreaterThan(2);
      }
      for (const [key, en] of Object.entries(mustNotMatchEn)) {
        expect(translate(lang, key as keyof typeof mustNotMatchEn)).not.toBe(en);
      }
    }

    expect(translate("it", "heroChat.guided.whereTitle")).toBe("Dove vuoi andare?");
    expect(translate("it", "inspiration.paris.title")).toBe("Parigi romantica");
    expect(translate("it", "testimonials.title")).toMatch(/viaggiatori/i);
    expect(translate("it", "donation.title")).toMatch(/Sostieni/i);
    expect(translate("it", "feat.itin.title")).toMatch(/Itinerario IA/i);
    expect(translate("it", "footer.about")).toBe("Chi siamo");
    expect(translate("es", "heroChat.guided.typeOwn")).toMatch(/otro/i);
    expect(translate("fr", "support.amountCustom")).toBe("Autre montant");
  });

  it("it/es/fr planner shell tips and checklist are not English", () => {
    expect(translate("it", "aiplan.tip2")).toMatch(/martedì|20%/i);
    expect(translate("it", "aiplan.tip2")).not.toBe(translate("en", "aiplan.tip2"));
    expect(translate("it", "heroChat.checklist.title")).toMatch(/viaggio/i);
    expect(translate("it", "results.selectAiPlan")).toMatch(/piano IA|Seleziona/i);
    expect(translate("it", "travelReq.title")).toMatch(/Requisiti/i);
    expect(translate("it", "aiplan.yourChoices")).toMatch(/impostazioni/i);
    expect(translate("es", "aiplan.tip2")).toMatch(/martes|20%/i);
    expect(translate("fr", "heroChat.checklist.title")).toMatch(/voyage/i);
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

  it("auth + dashboard strings exist in every UI language (not English-only)", () => {
    const keys = [
      "nav.signIn",
      "nav.signInGoogle",
      "dashboard.greeting",
      "dashboard.emptyTitle",
      "dashboard.metaTitle",
      "auth.welcomeBack",
      "auth.continueGoogle",
      "auth.completingTitle",
      "auth.failedTitle",
      "auth.connectingGoogle",
      "auth.loginMetaTitle",
      "auth.signupMetaTitle",
      "trips.title",
      "trips.metaTitle",
    ] as const;

    const localized: Record<string, RegExp> = {
      sl: /prijav|nadzorn|dobrodo|dokonč|povezuj|moja potovan/i,
      es: /iniciar|panel|bienven|completan|conectan|viajes/i,
      fr: /connexion|tableau|bon retour|finalisation|google|voyages/i,
      it: /acced|dashboard|bentorn|completament|connessione|viaggi/i,
      de: /anmeld|dashboard|willkommen|verbind|reisen/i,
    };

    for (const lang of SUPPORTED_LANGS) {
      for (const key of keys) {
        const value = translate(lang, key);
        expect(value).not.toBe(key);
        expect(value.trim().length).toBeGreaterThan(2);
      }
    }

    expect(translate("es", "nav.signIn")).toBe("Iniciar sesión");
    expect(translate("fr", "auth.continueGoogle")).toContain("Google");
    expect(translate("it", "dashboard.emptyTitle")).toMatch(/viaggio/i);
    expect(translate("de", "auth.failedTitle")).toMatch(/fehlgeschlagen/i);
    expect(translate("sl", "auth.failedTitle")).toBe("Prijava ni uspela");

    for (const [lang, re] of Object.entries(localized)) {
      expect(translate(lang as "sl", "auth.loginMetaTitle")).toMatch(re);
    }
  });
});
