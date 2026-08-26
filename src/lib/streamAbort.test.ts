import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyStreamAbort,
  createHiddenAwareIdleWatchdog,
  streamNeedsForegroundGuard,
  abortFetchWhenBackgrounded,
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
  const macSafari =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
  const macChrome =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const iphone =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const android =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

  it("flags phones and iPad, not desktop Safari or Chrome", () => {
    expect(streamNeedsForegroundGuard(macSafari, { maxTouchPoints: 0 })).toBe(false);
    expect(streamNeedsForegroundGuard(iphone)).toBe(true);
    expect(streamNeedsForegroundGuard(macChrome, { maxTouchPoints: 0 })).toBe(false);
    expect(streamNeedsForegroundGuard(android)).toBe(true);
  });

  it("does not treat desktop Safari as an iPad just because ontouchend exists", () => {
    expect(streamNeedsForegroundGuard(macSafari)).toBe(false);
    expect(streamNeedsForegroundGuard(macSafari, { maxTouchPoints: 0 })).toBe(false);
  });

  it("flags iPadOS that reports as Macintosh with multi-touch", () => {
    expect(streamNeedsForegroundGuard(macSafari, { maxTouchPoints: 5 })).toBe(true);
  });
});

describe("abortFetchWhenBackgrounded", () => {
  it("aborts once the tab is hidden", () => {
    let visibility: "visible" | "hidden" = "visible";
    let onHide: (() => void) | undefined;
    const abort = vi.fn();
    const stop = abortFetchWhenBackgrounded(abort, {
      enabled: true,
      getVisibility: () => visibility,
      addListeners: (fn) => {
        onHide = fn;
        return () => {
          onHide = undefined;
        };
      },
    });
    visibility = "hidden";
    onHide?.();
    expect(abort).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does nothing when the guard is off", () => {
    const abort = vi.fn();
    const stop = abortFetchWhenBackgrounded(abort, { enabled: false });
    stop();
    expect(abort).not.toHaveBeenCalled();
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
