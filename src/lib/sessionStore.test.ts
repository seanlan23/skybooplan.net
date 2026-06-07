import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PLAN_SCHEMA_VERSION,
  clearSession,
  loadSession,
  purgeLegacySessionCache,
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

describe("sessionStore cache invalidation", () => {
  beforeEach(() => {
    const storage = makeStorage();
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: storage },
      writable: true,
      configurable: true,
    });
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
});
