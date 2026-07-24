import { SUPPORTED_LANGS, translate, type Lang } from "@/lib/i18n";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { normalizePlanLangCode, type PlanLang } from "@/lib/planLanguages";

export function planTeaserText(lang: Lang = "sl"): string {
  return translate(lang, "plan.teaser");
}

/** Resolve stored content language or infer from teaser / common markers. */
export function resolvePlanContentLanguage(
  plan: Pick<AiTripPlan, "summary" | "contentLanguage" | "days">,
): PlanLang {
  if (plan.contentLanguage) return normalizePlanLangCode(plan.contentLanguage);

  const summary = plan.summary?.trim() ?? "";
  for (const code of SUPPORTED_LANGS) {
    const teaser = planTeaserText(code).trim();
    if (teaser && summary.startsWith(teaser)) return normalizePlanLangCode(code);
  }

  const sample = [
    summary,
    plan.days?.[0]?.title ?? "",
    plan.days?.[0]?.travelHack ?? "",
    plan.days?.[1]?.title ?? "",
  ].join(" ");

  if (/[àèéìòù]|\b(giorno|mattina|pomeriggio|sera|itinerario)\b/i.test(sample)) {
    return "it";
  }
  if (/[äöüß]|\b(tag|morgen|nachmittag|abend|reiseplan)\b/i.test(sample)) {
    return "de";
  }
  if (/[ñ¿¡]|\b(día|mañana|tarde|noche|itinerario)\b/i.test(sample)) {
    return "es";
  }
  if (/\b(jour|matin|après-midi|soir|itinéraire)\b/i.test(sample)) {
    return "fr";
  }
  if (/[čšžćđ]|\b(dan|dopoldan|popoldan|večer|načrt)\b/i.test(sample)) {
    return "sl";
  }
  return "en";
}

/** Ensure the locale-specific teaser opens the plan summary / season_warning intro. */
export function withPlanTeaser(summary: string, lang: Lang = "sl"): string {
  const teaser = planTeaserText(lang).trim();
  if (!teaser) return summary.trim();
  const body = summary.trim();
  if (!body) return teaser;
  if (body.startsWith(teaser) || body.includes(teaser)) return body;
  return `${teaser} ${body}`;
}

function stripOneTeaser(body: string, teaser: string): string {
  const t = teaser.trim();
  if (!body || !t) return body;
  if (body.startsWith(t)) return body.slice(t.length).trim();
  if (body.includes(t)) return body.replace(t, "").trim();
  return body;
}

/**
 * Remove marketing teaser from plan summary for display.
 * Strips every locale variant so IT-generated plans don't keep Italian opener in EN UI.
 */
export function stripPlanTeaser(summary: string, _lang: Lang = "sl"): string {
  let body = summary.trim();
  if (!body) return body;

  // Longest first so a shorter prefix doesn't leave a fragment.
  const teasers = SUPPORTED_LANGS.map((code) => planTeaserText(code).trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const teaser of teasers) {
    body = stripOneTeaser(body, teaser);
  }

  return body.replace(/^[.!?\s]+/, "").trim();
}
