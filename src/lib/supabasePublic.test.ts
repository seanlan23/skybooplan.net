import { describe, expect, it, vi } from "vitest";

vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-anon-key");

describe("withSupabaseApiKey", () => {
  it("adds apikey when missing", async () => {
    const { withSupabaseApiKey } = await import("./supabasePublic");
    const out = withSupabaseApiKey(
      "https://example.supabase.co/auth/v1/authorize?provider=google",
    );
    expect(out).toContain("apikey=test-anon-key");
    expect(out).toContain("provider=google");
  });

  it("does not duplicate apikey", async () => {
    const { withSupabaseApiKey } = await import("./supabasePublic");
    const out = withSupabaseApiKey(
      "https://example.supabase.co/auth/v1/authorize?provider=google&apikey=existing",
    );
    expect(out).toContain("apikey=existing");
    expect(out.match(/apikey=/g)?.length).toBe(1);
  });
});
