import { describe, expect, it } from "vitest";
import {
  ALLOWED_PLAN_LANGS,
  normalizePlanLangCode,
  planLanguageEnglishName,
  STRICT_LLM_LANGUAGE_RULE,
} from "@/lib/planLanguages";
import { languageWritingRule } from "@/lib/tripLocale";

describe("planLanguages", () => {
  it("allows only sl/en/de", () => {
    expect(ALLOWED_PLAN_LANGS).toEqual(["en", "sl", "de"]);
  });

  it("normalizes unknown codes to Slovenian and retired locales to English", () => {
    expect(normalizePlanLangCode("zh")).toBe("sl");
    expect(normalizePlanLangCode(undefined)).toBe("sl");
    expect(normalizePlanLangCode("DE")).toBe("de");
    expect(normalizePlanLangCode("it")).toBe("en");
    expect(normalizePlanLangCode("es")).toBe("en");
    expect(normalizePlanLangCode("fr")).toBe("en");
  });

  it("names languages in English for filled LLM constraints", () => {
    expect(planLanguageEnglishName("sl")).toBe("Slovenian");
    expect(planLanguageEnglishName("de")).toBe("German");
    expect(planLanguageEnglishName("en")).toBe("English");
    expect(planLanguageEnglishName("it")).toBe("English");
  });

  it("strict LLM rule allows only en/sl/de", () => {
    expect(STRICT_LLM_LANGUAGE_RULE).toMatch(/Never mix English terms or placeholder words/);
    expect(STRICT_LLM_LANGUAGE_RULE).toMatch(/Never mix languages/i);
    expect(STRICT_LLM_LANGUAGE_RULE).toMatch(/languageCode/i);
    expect(STRICT_LLM_LANGUAGE_RULE).toMatch(/en, sl, de/);
    expect(STRICT_LLM_LANGUAGE_RULE).not.toMatch(/es, fr, it/);
  });

  it("writing rules are monolingual per active locale", () => {
    expect(languageWritingRule("sl")).toMatch(/slovenščini/i);
    expect(languageWritingRule("sl")).toMatch(/Nikoli ne mešaj|Brez angleških/i);
    expect(languageWritingRule("de")).toMatch(/nur auf Deutsch/i);
    // Retired → EN writing rule
    expect(languageWritingRule("es")).toMatch(/English only/i);
  });
});
