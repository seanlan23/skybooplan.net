import { describe, expect, it } from "vitest";
import {
  ALLOWED_PLAN_LANGS,
  normalizePlanLangCode,
  STRICT_LLM_LANGUAGE_RULE,
} from "@/lib/planLanguages";
import { languageWritingRule } from "@/lib/tripLocale";

describe("planLanguages", () => {
  it("allows only six language codes", () => {
    expect(ALLOWED_PLAN_LANGS).toEqual(["en", "sl", "es", "fr", "it", "de"]);
  });

  it("normalizes unknown codes to Slovenian", () => {
    expect(normalizePlanLangCode("zh")).toBe("sl");
    expect(normalizePlanLangCode(undefined)).toBe("sl");
    expect(normalizePlanLangCode("DE")).toBe("de");
  });

  it("strict LLM rule forbids mixing languages", () => {
    expect(STRICT_LLM_LANGUAGE_RULE).toMatch(/Never mix languages/i);
    expect(STRICT_LLM_LANGUAGE_RULE).toMatch(/languageCode/i);
  });

  it("writing rules are monolingual per locale", () => {
    expect(languageWritingRule("sl")).toMatch(/slovenščini/i);
    expect(languageWritingRule("sl")).toMatch(/Nikoli ne mešaj|Brez angleških/i);
    expect(languageWritingRule("de")).toMatch(/nur auf Deutsch/i);
    expect(languageWritingRule("es")).toMatch(/solo en español/i);
  });
});
