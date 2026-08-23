import { useEffect } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
};

function wakeLockApi():
  | { request: (type: "screen") => Promise<WakeLockSentinelLike> }
  | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
  }).wakeLock;
}

/**
 * Call from the generate click (same user-gesture turn). iOS Safari rejects
 * wake-lock from a later useEffect.
 */
export function requestScreenWakeLock(): void {
  const api = wakeLockApi();
  if (!api || typeof document === "undefined") return;
  if (document.visibilityState !== "visible") return;
  void api.request("screen").catch(() => undefined);
}

/**
 * Keep the screen on while a long Gemini stream is in flight.
 * iOS still drops the lock if the user presses the side button — retry on visible.
 */
export function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const api = wakeLockApi();
    if (!api) return;

    let lock: WakeLockSentinelLike | null = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        lock = await api.request("screen");
      } catch {
        /* permission, battery saver, unsupported */
      }
    };

    void acquire();
    const onVis = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
      lock = null;
    };
  }, [enabled]);
}
