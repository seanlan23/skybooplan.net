import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DUFFEL_RATE_LIMIT_MAX_ATTEMPTS,
  fetchDuffelWithRateLimitRetry,
  resolveDuffelRetryDelayMs,
} from "@/lib/flights.functions";

describe("resolveDuffelRetryDelayMs", () => {
  it("returns null for non-429", () => {
    expect(resolveDuffelRetryDelayMs(500, 0, null)).toBeNull();
  });

  it("returns null when attempts are exhausted", () => {
    expect(
      resolveDuffelRetryDelayMs(429, DUFFEL_RATE_LIMIT_MAX_ATTEMPTS - 1, null),
    ).toBeNull();
  });

  it("uses fixed backoff without reset header", () => {
    expect(resolveDuffelRetryDelayMs(429, 0, null)).toBe(2_000);
    expect(resolveDuffelRetryDelayMs(429, 1, null)).toBe(5_000);
  });

  it("honours relative ratelimit-reset seconds", () => {
    expect(resolveDuffelRetryDelayMs(429, 0, "3")).toBe(3_000);
  });

  it("honours unix ratelimit-reset timestamp", () => {
    const now = 1_700_000_000_000;
    const resetUnix = Math.floor(now / 1000) + 4;
    expect(resolveDuffelRetryDelayMs(429, 0, String(resetUnix), now)).toBe(4_000);
  });
});

describe("fetchDuffelWithRateLimitRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retries 429 then returns success", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ errors: [{ code: "rate_limit_exceeded" }] }), {
          status: 429,
          headers: { "ratelimit-reset": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: "or_ok" } }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchDuffelWithRateLimitRetry("https://api.duffel.com/air/offer_requests", {
      method: "POST",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
