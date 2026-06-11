import { describe, expect, it } from "vitest";
import {
  ALLOWED_PLAN_CURRENCIES,
  formatPlanMoney,
  formatPlanMoneyRange,
  normalizePlanCurrency,
  STRICT_LLM_CURRENCY_RULE,
} from "@/lib/planCurrency";

describe("planCurrency", () => {
  it("allows only EUR and USD", () => {
    expect(ALLOWED_PLAN_CURRENCIES).toEqual(["EUR", "USD"]);
  });

  it("normalizes unknown codes to EUR", () => {
    expect(normalizePlanCurrency("GBP")).toBe("EUR");
    expect(normalizePlanCurrency("usd")).toBe("USD");
  });

  it("formats money with correct symbol", () => {
    expect(formatPlanMoney(42, "EUR")).toBe("€42");
    expect(formatPlanMoney(42, "USD")).toBe("$42");
  });

  it("formats ranges in display currency", () => {
    expect(formatPlanMoneyRange(5, 15, "USD")).toBe("$5–16");
    expect(formatPlanMoneyRange(10, 10, "EUR")).toBe("€10");
  });

  it("strict currency rule forbids mixing", () => {
    expect(STRICT_LLM_CURRENCY_RULE).toMatch(/Never mix/i);
    expect(STRICT_LLM_CURRENCY_RULE).toMatch(/REALISTIC PRICING/i);
  });
});
