import { translate, type Lang } from "@/lib/i18n";

export function planTeaserText(lang: Lang = "sl"): string {
  return translate(lang, "plan.teaser");
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

/** Remove marketing teaser from plan summary shown in the UI. */
export function stripPlanTeaser(summary: string, lang: Lang = "sl"): string {
  const teaser = planTeaserText(lang).trim();
  let body = summary.trim();
  if (!body || !teaser) return body;
  if (body.startsWith(teaser)) body = body.slice(teaser.length).trim();
  else if (body.includes(teaser)) body = body.replace(teaser, "").trim();
  return body.replace(/^[.!?\s]+/, "").trim();
}
