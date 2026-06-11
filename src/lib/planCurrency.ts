/** Display currencies supported in travel plans and UI. */
export const ALLOWED_PLAN_CURRENCIES = ["EUR", "USD"] as const;
export type PlanCurrency = (typeof ALLOWED_PLAN_CURRENCIES)[number];

/** Fixed reference rate for catalog bands / enricher hints (not live FX). */
export const EUR_TO_USD_RATE = 1.08;

const CURRENCY_STORAGE_KEY = "skybooplan.currency";

export function isPlanCurrency(code: string): code is PlanCurrency {
  return (ALLOWED_PLAN_CURRENCIES as readonly string[]).includes(code.toUpperCase());
}

export function normalizePlanCurrency(code: string | undefined | null): PlanCurrency {
  const raw = (code ?? "EUR").trim().toUpperCase();
  return isPlanCurrency(raw) ? raw : "EUR";
}

export function readStoredCurrency(): PlanCurrency {
  if (typeof window === "undefined") return "EUR";
  try {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (stored) return normalizePlanCurrency(stored);
  } catch {}
  return "EUR";
}

export function persistCurrency(code: PlanCurrency): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  } catch {}
}

export function currencySymbol(currency: PlanCurrency): string {
  return currency === "USD" ? "$" : "€";
}

/** Format a numeric plan amount with the correct symbol (no conversion). */
export function formatPlanMoney(amount: number, currency: PlanCurrency = "EUR"): string {
  const n = Math.round(amount);
  if (currency === "USD") return `$${n}`;
  return `€${n}`;
}

/** Format a range stored in EUR base bands into the display currency. */
export function formatPlanMoneyRange(
  minEur: number,
  maxEur: number,
  currency: PlanCurrency = "EUR",
): string {
  if (minEur === 0 && maxEur === 0) return "";
  const scale = currency === "USD" ? EUR_TO_USD_RATE : 1;
  const min = Math.round(minEur * scale);
  const max = Math.round(maxEur * scale);
  const sym = currencySymbol(currency);
  if (currency === "USD") {
    return min === max ? `$${min}` : `$${min}–${max}`;
  }
  return min === max ? `€${min}` : `€${min}–${max}`;
}

export function priceCurrencyPayload(currency: PlanCurrency): string {
  return currency === "USD" ? "USD ($) only" : "EUR (€) only";
}

export const STRICT_LLM_CURRENCY_RULE = `CURRENCY (mandatory):
- Allowed display currencies only: EUR (€) and USD ($). Use displayCurrency from the user message.
- You must strictly output ALL costs in the selected displayCurrency only: totalBudgetEur, dailyBudgetEur, estimatedCostEur, and every priceLabel string (activities, transport, highlights).
- JSON field names may keep the *Eur suffix, but numeric values and priceLabel text MUST be in displayCurrency — never mix € and $ in the same plan.
- Never show dual currencies (no "15 € (~$16)" or "500 THB (~12 €)").
- REALISTIC PRICING: adapt every cost to the destination's cost of living, then express it in displayCurrency. Examples: local dinner in Sri Lanka ≈ $5–15 or €5–12 (not $40); street food in Bangkok ≈ $2–6; museum in Paris ≈ €15–18 or $16–20; Tanzania safari game drive ≈ $200+/person/day. Budget destinations use lower ranges; premium cities and safaris use higher ranges.`;

export function currencyWritingRule(currency: PlanCurrency): string {
  const sym = currencySymbol(currency);
  return `All monetary amounts and priceLabel fields must use ${currency} (${sym}) only — convert every cost into ${currency} at realistic local rates. Never mix with the other currency.`;
}
