export type StreamAbortKind = "user" | "idle" | "connection";

export function classifyStreamAbort(opts: {
  aborted: boolean;
  userAborted: boolean;
  idleTimedOut: boolean;
}): StreamAbortKind | null {
  if (!opts.aborted) return null;
  if (opts.userAborted) return "user";
  if (opts.idleTimedOut) return "idle";
  return "connection";
}

/**
 * Phone/tablet only. Desktop Safari/Chrome must not abort on a tab switch —
 * that kills a live Gemini stream. iOS/Android freeze (or drop) background
 * fetches, so those still abort + resume.
 *
 * Do NOT use `"ontouchend" in document`: desktop Safari and Chrome set it,
 * which used to abort generation whenever you switched tabs on a Mac.
 * iPadOS 13+ reports as Macintosh with maxTouchPoints > 1.
 */
export function streamNeedsForegroundGuard(
  ua?: string,
  opts?: { maxTouchPoints?: number },
): boolean {
  const n = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (/iP(hone|ad|od)/i.test(n)) return true;
  if (/Android/i.test(n)) return true;
  if (!/Macintosh/i.test(n)) return false;
  const points =
    opts?.maxTouchPoints ??
    (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  return points > 1;
}

/**
 * Mobile WebKit/Chrome freeze a live fetch when the tab backgrounds.
 * Abort so the client can resume instead of hanging on `reader.read()`.
 */
export function abortFetchWhenBackgrounded(
  abort: () => void,
  opts?: {
    enabled?: boolean;
    getVisibility?: () => DocumentVisibilityState | "visible" | "hidden";
    addListeners?: (fn: () => void) => () => void;
  },
): () => void {
  const enabled = opts?.enabled ?? (typeof navigator !== "undefined" && streamNeedsForegroundGuard());
  if (!enabled) return () => undefined;

  const getVisibility =
    opts?.getVisibility ??
    (() => (typeof document !== "undefined" ? document.visibilityState : "visible"));

  const fire = () => {
    if (getVisibility() === "hidden") abort();
  };

  if (opts?.addListeners) return opts.addListeners(fire);

  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => undefined;
  }
  const onVis = () => {
    if (document.visibilityState === "hidden") abort();
  };
  const onPageHide = () => abort();
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", onPageHide);
  };
}

export function isDocumentHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * Pause the client idle abort while the tab is hidden. Safari freezes timers;
 * on wake they fire at once and would kill a still-alive (or just-retried) stream.
 */
export function createHiddenAwareIdleWatchdog(
  onIdle: () => void,
  idleMs: number,
  opts?: {
    getVisibility?: () => DocumentVisibilityState | "visible" | "hidden";
    addVisibilityListener?: (fn: () => void) => () => void;
  },
): {
  bump: () => void;
  clear: () => void;
  dispose: () => void;
  isTimedOut: () => boolean;
} {
  const getVisibility =
    opts?.getVisibility ??
    (() => (typeof document !== "undefined" ? document.visibilityState : "visible"));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const bump = () => {
    clear();
    if (getVisibility() === "hidden") return;
    timer = setTimeout(() => {
      timedOut = true;
      onIdle();
    }, idleMs);
  };

  const onVis = () => {
    if (getVisibility() === "hidden") {
      clear();
      return;
    }
    if (!timedOut) bump();
  };

  let remove = () => undefined as void;
  if (opts?.addVisibilityListener) {
    remove = opts.addVisibilityListener(onVis);
  } else if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVis);
    remove = () => document.removeEventListener("visibilitychange", onVis);
  }

  return {
    bump,
    clear,
    dispose: () => {
      clear();
      remove();
    },
    isTimedOut: () => timedOut,
  };
}

/** Screen lock / background: wait until the tab is visible before retrying fetch. */
export function waitUntilDocumentVisible(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  if (typeof document === "undefined") return Promise.resolve();
  if (document.visibilityState === "visible") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const done = () => {
      document.removeEventListener("visibilitychange", onVis);
      if (typeof window !== "undefined") {
        window.removeEventListener("pageshow", onVis);
      }
      signal?.removeEventListener("abort", onAbort);
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        done();
        resolve();
      }
    };
    const onAbort = () => {
      done();
      reject(new DOMException("Aborted", "AbortError"));
    };
    document.addEventListener("visibilitychange", onVis);
    if (typeof window !== "undefined") {
      window.addEventListener("pageshow", onVis);
    }
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    if (document.visibilityState === "visible") onVis();
  });
}
