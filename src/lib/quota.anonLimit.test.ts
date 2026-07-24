import { describe, expect, it } from "vitest";
import { ANON_FREE_COMPLETE_PLANS } from "@/lib/quota.server";
import { isSoftQuotaError } from "@/lib/i18n";

describe("anon plan quota", () => {
  it("allows two complete free plans per IP", () => {
    expect(ANON_FREE_COMPLETE_PLANS).toBe(2);
  });

  it("treats quota messages as soft (non-red) errors", () => {
    expect(isSoftQuotaError("error.quotaAnonLimit")).toBe(true);
    expect(isSoftQuotaError("error.quotaSignIn")).toBe(true);
    expect(isSoftQuotaError("Quota exceeded")).toBe(false);
    expect(isSoftQuotaError("error.geminiRateLimit")).toBe(false);
  });
});
