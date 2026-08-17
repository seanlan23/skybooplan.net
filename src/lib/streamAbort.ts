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
