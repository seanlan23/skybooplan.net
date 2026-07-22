import { describe, expect, it } from "vitest";
import { buildGoogleOAuthStartHtml } from "@/lib/authGoogleStartHtml";

describe("buildGoogleOAuthStartHtml", () => {
  it("embeds brand mark, wordmark, and oauth fields", () => {
    const html = buildGoogleOAuthStartHtml({
      csrfToken: "token-123",
      callbackUrl: "http://localhost:8080/auth/callback",
    });
    expect(html).toContain("skybooplan");
    expect(html).toContain("#0EA5E9");
    expect(html).toContain('name="csrfToken"');
    expect(html).toContain("token-123");
    expect(html).toContain("Povezujem z Googlom");
    expect(html).toContain('action="/api/auth/signin/google"');
  });
});
