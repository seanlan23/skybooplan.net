import { normalizePlanLangCode, type PlanLang } from "@/lib/planLanguages";

/** Active plan langs + optional dormant keys (ignored by normalize → en). */
type CopySet = Partial<Record<PlanLang | "es" | "fr" | "it", string>> & {
  en: string;
  sl: string;
};

/** Pick plan-generated copy for the active UI/plan language (not only SL vs EN). */
export function planLangCopy(langCode: string | undefined, copies: CopySet): string {
  const code = normalizePlanLangCode(langCode ?? "en");
  return copies[code] ?? copies.en;
}

export function driveTypeLabel(langCode: string | undefined): string {
  return planLangCopy(langCode, {
    sl: "Vožnja",
    en: "Drive",
    de: "Fahrt",
    es: "Trayecto",
    fr: "Trajet",
    it: "Percorso",
  });
}
