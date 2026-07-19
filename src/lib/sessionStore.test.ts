import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PLAN_SCHEMA_VERSION,
  clearPlanFromSession,
  clearSession,
  consumeHomeReset,
  loadSession,
  purgeLegacySessionCache,
  requestHomeReset,
  saveSession,
} from "@/lib/sessionStore";

const KEY = `skybooplan:lastSession:v${PLAN_SCHEMA_VERSION}`;

function makeStorage() {
  const store: Record<string, string> = {};
  return {
    store,
    getItem(k: string) {
      return store[k] ?? null;
    },
    setItem(k: string, v: string) {
      store[k] = v;
    },
    removeItem(k: string) {
      delete store[k];
    },
  };
}

function mockWindow() {
  const localStorage = makeStorage();
  const sessionStorage = makeStorage();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage, sessionStorage },
    writable: true,
    configurable: true,
  });
}

describe("sessionStore cache invalidation", () => {
  beforeEach(() => {
    mockWindow();
  });

  afterEach(() => {
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });

  it("purges v1 legacy key on load", () => {
    window.localStorage.setItem(
      "skybooplan:lastSession:v1",
      JSON.stringify({ ts: Date.now(), aiPlan: { days: [] } }),
    );
    purgeLegacySessionCache();
    expect(window.localStorage.getItem("skybooplan:lastSession:v1")).toBeNull();
  });

  it("rejects session without matching planSchemaVersion", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        planSchemaVersion: 1,
        ts: Date.now(),
        aiPlan: { destinationName: "stale" },
      }),
    );
    expect(loadSession()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("saves and loads current schema version", () => {
    saveSession({ aiError: "test" });
    const s = loadSession();
    expect(s?.planSchemaVersion).toBe(PLAN_SCHEMA_VERSION);
    expect(s?.aiError).toBe("test");
  });

  it("clearSession removes current and legacy keys", () => {
    window.localStorage.setItem(KEY, "{}");
    window.localStorage.setItem("skybooplan:lastSession:v1", "{}");
    clearSession();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(window.localStorage.getItem("skybooplan:lastSession:v1")).toBeNull();
  });

  it("persists and restores searchDraft", () => {
    const draft = {
      mode: "ai" as const,
      from: "Ljubljana",
      to: "Bangkok",
      departDate: "2026-09-01",
      returnDate: "2026-09-14",
      pax: 2,
    };
    saveSession({ searchDraft: draft });
    expect(loadSession()?.searchDraft).toEqual(draft);
  });

  it("keeps aiPlan across partial session updates", () => {
    const plan = {
      destinationName: "New York",
      days: [{ day: 1, city: "New York" }],
    };
    saveSession({ aiPlan: plan as never, searchDraft: { mode: "ai" as const, from: "VCE", to: "JFK", departDate: "2026-09-01", pax: 2 } });
    saveSession({ aiError: "stream timeout — delni načrt" });
    const s = loadSession();
    expect(s?.aiPlan).toEqual(plan);
    expect(s?.aiError).toMatch(/delni/);
    expect(s?.searchDraft?.to).toBe("JFK");
  });

  it("clearPlanFromSession removes plan but keeps search draft", () => {
    saveSession({
      aiPlan: { destinationName: "Phuket", days: [] } as never,
      aiSkeleton: { regions: [] } as never,
      aiError: "x",
      aiGenStartedAt: 123,
      savedPlanId: "abc",
      searchDraft: {
        mode: "ai" as const,
        from: "MUC",
        to: "HKT",
        departDate: "2026-10-26",
        pax: 3,
      },
      aiContext: { from: "MUC", to: "HKT", departDate: "2026-10-26", pax: 3 },
    });
    clearPlanFromSession();
    const s = loadSession();
    expect(s?.aiPlan).toBeNull();
    expect(s?.aiSkeleton).toBeNull();
    expect(s?.aiError).toBeNull();
    expect(s?.aiGenStartedAt).toBeNull();
    expect(s?.savedPlanId).toBeNull();
    expect(s?.searchDraft?.to).toBe("HKT");
    expect(s?.aiContext?.to).toBe("HKT");
  });

  it("requestHomeReset is consumed once", () => {
    requestHomeReset();
    expect(consumeHomeReset()).toBe(true);
    expect(consumeHomeReset()).toBe(false);
  });
});
