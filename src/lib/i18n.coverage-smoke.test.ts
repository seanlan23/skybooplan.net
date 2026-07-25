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
  "ai.interests",
  "ai.interest.beaches",
  "ai.budget",
  "ai.specialWishes",
  "ai.wishesOptional",
  "heroTrip.planTitle",
  "aiplan.downloadPdf",
  "aiplan.totalIncludes",
  "dashboard.donationBadge",
  "dashboard.donationTitle",
  "context.flightLand",
  "aiplan.streamingProgress",
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

  it("EU Schengen travel-req bodies are localized for de (retired langs → EN)", () => {
    const de = buildFallbackTravelRequirements("MUC", "MUC", "de");
    expect(de?.visaInfo?.[0]?.requirement).toBeTruthy();
    expect(de!.visaInfo[0]!.requirement).not.toMatch(/do not need a visa for/i);

    // Retired UI langs map to English copy.
    for (const lang of ["it", "es", "fr"] as const) {
      const req = buildFallbackTravelRequirements("MUC", "MUC", lang);
      expect(req!.visaInfo[0]!.requirement).toMatch(/do not need a visa|visa-free|Schengen/i);
    }
  });

  it("UK/USA travel-req bodies stay English for retired langs", () => {
    for (const lang of ["it", "es", "fr"] as const) {
      const uk = buildFallbackTravelRequirements("LHR", "LHR", lang);
      const us = buildFallbackTravelRequirements("JFK", "JFK", lang);
      expect(uk!.visaInfo[0]!.requirement).toMatch(/UK|visa|ETA/i);
      expect(us!.visaInfo[0]!.requirement).toMatch(/ESTA|Visa Waiver|USA|United States/i);
    }
  });

  it("Philippines travel-req bodies fall back to EN for retired it", () => {
    const req = buildFallbackTravelRequirements("MNL", "MNL", "it");
    expect(req!.visaInfo[0]!.requirement).toMatch(/Philippines|visa-free/i);
  });
});
