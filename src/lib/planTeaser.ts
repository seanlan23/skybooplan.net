import { translate, type Lang } from "@/lib/i18n";

/** First 3 days are free; day 4+ (index >= 3) are paywalled when locked. */
export const PAYWALL_FREE_DAYS = 3;
export const PAYWALL_LOCKED_FROM_INDEX = 3;

const PROMO_UNLOCK_CODES = new Set(["ROK2026", "DARILO"]);

/** Temporary promo unlock — valid gift codes bypass the day-4+ paywall. */
export function isPromoUnlockCode(code: string): boolean {
  return PROMO_UNLOCK_CODES.has(code.trim().toUpperCase());
}

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
