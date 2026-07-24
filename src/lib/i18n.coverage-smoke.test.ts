import { describe, expect, it } from "vitest";
import { translate, SUPPORTED_LANGS } from "@/lib/i18n";
import { buildFallbackTravelRequirements } from "@/lib/travelRequirements";

/** Surfaces that must not equal English for non-en locales (length > 18). */
const SURFACE_KEYS = [
  "footer.product",
  "footer.company",
  "footer.about",
  "footer.tagline",
  "donation.title",
  "support.title",
  "feat.itin.title",
  "faq.title",
  "heroChat.guided.whereTitle",
  "heroChat.checklist.title",
  "aiplan.tip2",
  "results.selectAiPlan",
  "travelReq.title",
  "aiplan.yourChoices",
  "aiplan.day",
  "activity.type.transport",
  "nav.flights",
  "confirm.title",
  "skeleton.expandFull",
  "paywall.loginTitle",
  "cookieConsent.acceptAll",
  "about.title",
  "terms.title",
  "pricing.title1",
  "weather.summaryClothing",
] as const;

describe("i18n surface coverage", () => {
  it("non-English UI languages differ from English on key surfaces", () => {
    for (const lang of SUPPORTED_LANGS) {
      if (lang === "en") continue;
      for (const key of SURFACE_KEYS) {
        const value = translate(lang, key);
        const en = translate("en", key);
        expect(value, `${lang}.${key}`).not.toBe(key);
        expect(value.trim().length, `${lang}.${key}`).toBeGreaterThan(1);
        if (en.length > 18) {
          expect(value, `${lang}.${key} still English`).not.toBe(en);
        }
      }
    }
  });

  it("EU Schengen travel-req bodies are localized for it/es/fr/de", () => {
    for (const lang of ["it", "es", "fr", "de"] as const) {
      const req = buildFallbackTravelRequirements("MUC", "MUC", lang);
      expect(req?.visaInfo?.[0]?.requirement).toBeTruthy();
      expect(req!.visaInfo[0]!.requirement).not.toMatch(/do not need a visa for/i);
    }
    expect(buildFallbackTravelRequirements("MUC", "MUC", "it")!.visaInfo[0]!.requirement).toMatch(
      /visto|UE\/Schengen/i,
    );
  });

  it("UK/USA travel-req bodies are localized for it/es/fr", () => {
    for (const lang of ["it", "es", "fr"] as const) {
      const uk = buildFallbackTravelRequirements("LHR", "LHR", lang);
      const us = buildFallbackTravelRequirements("JFK", "JFK", lang);
      expect(uk!.visaInfo[0]!.requirement).not.toMatch(/do not need a visa for short UK/i);
      expect(us!.visaInfo[0]!.requirement).not.toMatch(/need ESTA \(Visa Waiver Program\)/i);
    }
  });
});
