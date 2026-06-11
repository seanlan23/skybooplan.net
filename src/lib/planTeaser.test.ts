import { describe, it, expect } from "vitest";
import {
  withPlanTeaser,
  PAYWALL_FREE_DAYS,
  PAYWALL_LOCKED_FROM_INDEX,
  isPromoUnlockCode,
} from "@/lib/planTeaser";
import { translate } from "@/lib/i18n";

describe("planTeaser", () => {
  it("prepends Slovenian teaser when missing", () => {
    const teaser = translate("sl", "plan.teaser");
    const out = withPlanTeaser("Sezonsko opozorilo za Tajsko.", "sl");
    expect(out.startsWith(teaser)).toBe(true);
    expect(out).toContain("Sezonsko opozorilo");
  });

  it("does not duplicate teaser if already present", () => {
    const teaser = translate("en", "plan.teaser");
    const out = withPlanTeaser(`${teaser} Monsoon season note.`, "en");
    expect(out).toBe(`${teaser} Monsoon season note.`);
  });

  it("paywall locks from day index 3 when more than 3 days", () => {
    expect(PAYWALL_FREE_DAYS).toBe(3);
    expect(PAYWALL_LOCKED_FROM_INDEX).toBe(3);
  });

  it("accepts promo unlock codes case-insensitively", () => {
    expect(isPromoUnlockCode("ROK2026")).toBe(true);
    expect(isPromoUnlockCode("darilo")).toBe(true);
    expect(isPromoUnlockCode("  DARILO  ")).toBe(true);
    expect(isPromoUnlockCode("INVALID")).toBe(false);
  });
});
