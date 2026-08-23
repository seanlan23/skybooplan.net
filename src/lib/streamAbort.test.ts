import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyStreamAbort,
  createHiddenAwareIdleWatchdog,
  streamNeedsForegroundGuard,
  waitUntilDocumentVisible,
} from "@/lib/streamAbort";

describe("classifyStreamAbort", () => {
  it("treats explicit cancel as user abort", () => {
    expect(
      classifyStreamAbort({ aborted: true, userAborted: true, idleTimedOut: false }),
    ).toBe("user");
  });

  it("treats watchdog timeout as idle", () => {
    expect(
      classifyStreamAbort({ aborted: true, userAborted: false, idleTimedOut: true }),
    ).toBe("idle");
  });

  it("treats screen-lock / iOS fetch kill as a connection drop", () => {
    expect(
      classifyStreamAbort({ aborted: true, userAborted: false, idleTimedOut: false }),
    ).toBe("connection");
  });

  it("returns null when the stream was not aborted", () => {
    expect(
      classifyStreamAbort({ aborted: false, userAborted: false, idleTimedOut: false }),
    ).toBeNull();
  });
});

describe("streamNeedsForegroundGuard", () => {
  it("flags desktop Safari and iOS WebKit, not Chrome", () => {
    expect(
      streamNeedsForegroundGuard(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        { ontouchend: false },
      ),
    ).toBe(true);
    expect(
      streamNeedsForegroundGuard(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(true);
    expect(
      streamNeedsForegroundGuard(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        { ontouchend: false },
      ),
    ).toBe(false);
  });
});

describe("createHiddenAwareIdleWatchdog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fire while the tab is hidden, then restarts on visible", () => {
    vi.useFakeTimers();
    let visibility: "visible" | "hidden" = "visible";
    let onVis: (() => void) | undefined;
    const onIdle = vi.fn();
    const watch = createHiddenAwareIdleWatchdog(onIdle, 1_000, {
      getVisibility: () => visibility,
      addVisibilityListener: (fn) => {
        onVis = fn;
        return () => {
          onVis = undefined;
        };
      },
    });
    watch.bump();
    visibility = "hidden";
    onVis?.();
    vi.advanceTimersByTime(5_000);
    expect(onIdle).not.toHaveBeenCalled();
    visibility = "visible";
    onVis?.();
    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onIdle).toHaveBeenCalledTimes(1);
    watch.dispose();
  });
});

describe("waitUntilDocumentVisible", () => {
  it("resolves immediately when the tab is already visible", async () => {
    await expect(waitUntilDocumentVisible()).resolves.toBeUndefined();
  });

  it("rejects when the wait is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(waitUntilDocumentVisible(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
