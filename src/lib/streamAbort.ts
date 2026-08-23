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

/** Safari (desktop) and every iOS WebKit browser freeze long fetches in the background. */
export function streamNeedsForegroundGuard(
  ua?: string,
  opts?: { ontouchend?: boolean },
): boolean {
  const n = ua ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (/iP(hone|ad|od)/i.test(n)) return true;
  const macTouch =
    /Macintosh/i.test(n) &&
    (opts?.ontouchend ??
      (typeof document !== "undefined" && "ontouchend" in document));
  if (macTouch) return true;
  return /safari/i.test(n) && !/chrome|chromium|crios|android|fxios|edg|opr\//i.test(n);
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
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
