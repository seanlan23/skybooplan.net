/** Languages the app may generate content in and expose in the UI. */
export const ALLOWED_PLAN_LANGS = ["en", "sl", "de"] as const;
export type PlanLang = (typeof ALLOWED_PLAN_LANGS)[number];

/** Retired locales — still present in dormant i18n packs; map to English. */
const RETIRED_PLAN_LANGS = new Set(["es", "fr", "it"]);

export function isPlanLang(code: string): code is PlanLang {
  return (ALLOWED_PLAN_LANGS as readonly string[]).includes(code);
}

/** Coerce persisted / user input to a supported plan language (default Slovenian). */
export function normalizePlanLangCode(code: string | undefined | null): PlanLang {
  const raw = (code ?? "sl").trim().toLowerCase().slice(0, 2);
  if (RETIRED_PLAN_LANGS.has(raw)) return "en";
  return isPlanLang(raw) ? raw : "sl";
}

const PLAN_LANG_ENGLISH_NAME: Record<PlanLang, string> = {
  sl: "Slovenian",
  en: "English",
  de: "German",
};

/** English language name for LLM constraints (never leave [LANGUAGE]). */
export function planLanguageEnglishName(code?: string | null): string {
  return PLAN_LANG_ENGLISH_NAME[normalizePlanLangCode(code)];
}

/** Injected into every LLM system prompt for itinerary generation. */
export const STRICT_LLM_LANGUAGE_RULE = `LANGUAGE (mandatory):
- Output must be strictly 100% in the requested target language (languageCode). Never mix English terms or placeholder words.
- You must strictly output the entire JSON and all human-readable content in the user's selected languageCode from the user message.
- Allowed language codes only: en, sl, de.
- Never mix languages in the same response — no bilingual lines, no dual translations, no English glosses in parentheses when another language is selected.
- If languageCode is "sl", every title, description, tip, and day name must be 100% Slovenian. Do not mix English and Slovenian in the same title or sentence (official place names and airport codes only exception). Never leave cut English stubs ("Top of.", "Walk of.", "Canal.", "→ St.").
- If languageCode is "de", every sentence must be 100% German (proper nouns and airport codes only exception).
- POI names may stay in their official local form; all descriptions, tips, labels, titles, and price text must match languageCode.
- Never invent placeholder fragments. If a name does not fit, omit the activity rather than cutting it mid-word.

See also CURRENCY rules in the same system prompt — language and currency constraints apply together.`;

/** Day label prefixes used in AI titles — stripped to avoid "Dan 1: Dan 1: …". */
export const DAY_TITLE_PREFIXES = ["Day", "Dan", "Día", "Dia", "Jour", "Tag", "Giorno"] as const;
