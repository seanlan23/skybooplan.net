import { describe, expect, it } from "vitest";
import { hasUnlimitedAccess } from "@/lib/unlimitedAccess";

describe("hasUnlimitedAccess", () => {
  it("grants founder and allowlisted emails unlimited access", () => {
    expect(hasUnlimitedAccess("rokkricej@gmail.com")).toBe(true);
    expect(hasUnlimitedAccess(" RokKricej@Gmail.com ")).toBe(true);
    expect(hasUnlimitedAccess("tomazgorec@gmail.com")).toBe(true);
  });

  it("denies other emails", () => {
    expect(hasUnlimitedAccess("someone@example.com")).toBe(false);
    expect(hasUnlimitedAccess(null)).toBe(false);
    expect(hasUnlimitedAccess("")).toBe(false);
  });
});
