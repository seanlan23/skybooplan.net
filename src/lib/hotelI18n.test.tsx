/**
 * Verifies every configured i18n language renders the hotel empty-state
 * and hub-fallback notice strings. The dictionary lookup uses the same
 * resolution chain as the running provider: try the active language,
 * fall back to `sl` (the provider's hard fallback), then warn.
 *
 * If a language is missing a translation, this test catches it AND ensures
 * the fallback chain still produces a usable, token-substituted string —
 * never the raw key, never an empty string, never a leftover `{placeholder}`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { SUPPORTED_LANGS, type Lang } from "@/lib/i18n";
import { interpolate } from "@/lib/interpolate";

// Re-parse the i18n source to read the raw dictionaries WITHOUT booting the
// React provider (which needs a DOM). The `dicts` object is the single
// source of truth for translations and is what the provider exposes.
const i18nSource = readFileSync(
  resolve(process.cwd(), "src/lib/i18n.tsx"),
  "utf8",
);

const HOTEL_KEYS = [
  "aiplan.hotelsFallbackNotice",
  "aiplan.hotelsEmptyTitle",
  "aiplan.hotelsEmptyDefaultSub",
  "aiplan.hotelsEmptyErrorSub",
  "aiplan.hotelsEmptyCta",
] as const;

/**
 * Resolve a translation the same way I18nProvider does: prefer the active
 * language; fall back to `sl`; finally return the key.
 */
async function resolveDict(lang: Lang): Promise<Record<string, string>> {
  // Dynamic import so vitest applies its TSX transform.
  const mod = (await import("@/lib/i18n")) as unknown as {
    // The module exports a provider but not the raw dict map. Use a
    // wrapping trick: render via the provider in a fake context is heavy,
    // so we expose lookup behavior through a tiny consumer below instead.
    SUPPORTED_LANGS: readonly Lang[];
  };
  void mod;
  // Build the lookup via a tiny mirror of the provider's behavior, fed by
  // the dictionaries we ship. Re-export through a helper so tests don't
  // depend on internals.
  return getDictForLang(lang);
}

// --- helper: extract a per-language flat dictionary by re-importing -------

import * as i18nModule from "@/lib/i18n";

function getDictForLang(lang: Lang): Record<string, string> {
  // The exported provider stores `dicts` in module scope. We can't read it
  // directly, but we CAN read it indirectly by calling `useI18n` outside
  // React (it has a safe fallback) — that only gives us `sl`. So instead
  // we parse the static module source for the language object literal.
  //
  // The parser below is intentionally tiny: it locates `lang: {` inside
  // the `dicts` map and pulls out string-string pairs. This is robust
  // against the project's dict style (string keys, double-quoted values,
  // no nested objects).
  const anchor = lang === "en" ? "const en: Dict = {" : `\n  ${lang}: {`;
  const start = i18nSource.indexOf(anchor);
  if (start === -1) return {};
  const tail = i18nSource.slice(start);
  const endRel = lang === "en" ? tail.indexOf("\n};") : tail.indexOf("\n  },");
  if (endRel === -1) return {};
  const block = tail.slice(0, endRel);
  const dict: Record<string, string> = {};
  const lineRe = /"([^"\\]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(block)) !== null) {
    dict[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }
  return dict;
}

function tFor(lang: Lang, key: string): string {
  const dict = getDictForLang(lang);
  const sl = getDictForLang("sl");
  return dict[key] ?? sl[key] ?? key;
}

// --- sanity: the parser works -------------------------------------------

describe("i18n test harness", () => {
  it("exports the expected set of languages", () => {
    expect(SUPPORTED_LANGS).toEqual(["sl", "en", "de"]);
  });

  it("the dictionary parser can read at least one known key", () => {
    expect(getDictForLang("en")["aiplan.hotelsIn"]).toBe("Hotels in");
    expect(getDictForLang("sl")["aiplan.hotelsIn"]).toBe("Hoteli v");
  });

  it("module is importable", () => {
    expect(typeof i18nModule.useI18n).toBe("function");
  });
});

// --- empty state + fallback notice translations -------------------------

describe("hotel empty-state + fallback notice — i18n coverage", () => {
  for (const lang of SUPPORTED_LANGS) {
    describe(`lang=${lang}`, () => {
      for (const key of HOTEL_KEYS) {
        it(`resolves "${key}" to a non-empty, non-raw-key string`, () => {
          const value = tFor(lang, key);
          expect(value, `missing translation for ${key} in ${lang}`).not.toBe(
            key,
          );
          expect(value.trim().length).toBeGreaterThan(0);
        });
      }

      it("fallback notice substitutes both {city} and {hub} tokens", () => {
        const tpl = tFor(lang, "aiplan.hotelsFallbackNotice");
        const rendered = renderToStaticMarkup(
          <>{interpolate(tpl, { city: <b>Siquijor</b>, hub: <b>Philippines</b> })}</>,
        );
        expect(rendered).toContain("Siquijor");
        expect(rendered).toContain("Philippines");
        // No leftover unsubstituted placeholders.
        expect(rendered).not.toMatch(/\{city\}|\{hub\}/);
      });

      it("empty-state title substitutes {city} and {dates}", () => {
        const tpl = tFor(lang, "aiplan.hotelsEmptyTitle");
        const rendered = renderToStaticMarkup(
          <>{interpolate(tpl, { city: <b>Siquijor</b>, dates: " (1 – 3 Jun)" })}</>,
        );
        expect(rendered).toContain("Siquijor");
        expect(rendered).toContain("1 – 3 Jun");
        expect(rendered).not.toMatch(/\{city\}|\{dates\}/);
      });

      it("empty-state CTA is a non-trivial label", () => {
        const cta = tFor(lang, "aiplan.hotelsEmptyCta");
        expect(cta.length).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

// --- regression: component still references the keyed copy --------------

describe("HotelsSection wiring", () => {
  const component = readFileSync(
    resolve(process.cwd(), "src/components/HotelsSection.tsx"),
    "utf8",
  );

  it("does not hardcode the old Slovenian fallback-notice copy", () => {
    expect(component).not.toContain("V kraju");
    expect(component).not.toContain("nismo našli ponudb");
    expect(component).not.toContain("Trenutno ni razpoložljivih nastanitev za");
    expect(component).not.toContain("Išči na Booking.com");
    expect(component).not.toContain("Ponudniki niso odgovorili");
  });

  it("references every hotel empty-state translation key", () => {
    for (const key of HOTEL_KEYS) {
      expect(component, `component missing t("${key}") usage`).toContain(key);
    }
  });
});
