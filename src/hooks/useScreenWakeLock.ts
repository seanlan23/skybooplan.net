import { useEffect } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
};

/**
 * Keep the screen on while a long Gemini stream is in flight.
 * iOS still drops the lock if the user presses the side button — retry on visible.
 */
export function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock?.request) return;

    let lock: WakeLockSentinelLike | null = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        lock = await nav.wakeLock!.request("screen");
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
