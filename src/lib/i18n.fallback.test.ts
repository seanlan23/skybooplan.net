import { describe, it, expect } from "vitest";
import {
  normalizeAppLang,
  translate,
  translationFallbackChain,
} from "@/lib/i18n";

describe("i18n strict fallback", () => {
  it("de uses English only — no mixed German/English nav", () => {
    expect(translationFallbackChain("de")).toEqual(["en", "sl"]);
    expect(translate("de", "nav.signIn")).toBe("Sign in");
    expect(translate("de", "tab.flights")).toBe("Flights");
    expect(translate("de", "hero.subtitle")).not.toMatch(/Finde|Suchen/i);
  });

  it("sl prefers Slovenian with English fallback", () => {
    expect(translationFallbackChain("sl")).toEqual(["sl", "en"]);
    expect(translate("sl", "nav.signIn")).toBe("Prijava");
  });

  it("normalizeAppLang maps incomplete locales to en", () => {
    expect(normalizeAppLang("de")).toBe("en");
    expect(normalizeAppLang("fr")).toBe("en");
    expect(normalizeAppLang("sl")).toBe("sl");
    expect(normalizeAppLang("en")).toBe("en");
    expect(normalizeAppLang("xx")).toBe("sl");
  });

  it("never returns raw key for core homepage strings", () => {
    for (const lang of ["de", "fr", "zh", "sl", "en"] as const) {
      expect(translate(lang, "hero.title.c")).not.toBe("hero.title.c");
      expect(translate(lang, "paywall.unlockPlanCta").trim().length).toBeGreaterThan(10);
    }
  });
});
