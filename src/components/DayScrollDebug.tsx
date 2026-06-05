import { useEffect, useState } from "react";

type Props = {
  activeDay: number;
  threshold?: number; // 0..1 fraction of viewport height
};

/**
 * Debug overlay for the itinerary scroll-sync.
 * Activates only when the URL contains ?debug=1 (or ?debug=scroll).
 * Draws the threshold line used to decide the active day and shows the active day.
 */
export function DayScrollDebug({ activeDay, threshold = 0.38 }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [vh, setVh] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("debug");
    setEnabled(d === "1" || d === "scroll" || d === "true");
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!enabled) return null;

  const top = Math.round(vh * threshold);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[9999]"
      style={{ contain: "layout paint" }}
    >
      {/* Threshold line */}
      <div
        className="absolute left-0 right-0"
        style={{
          top,
          height: 0,
          borderTop: "2px dashed #ef4444",
          boxShadow: "0 0 0 1px rgba(239,68,68,0.25)",
        }}
      />
      {/* Threshold label on the line */}
      <div
        className="absolute left-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wide"
        style={{
          top: top - 9,
          background: "#ef4444",
          color: "#fff",
        }}
      >
        threshold {Math.round(threshold * 100)}% · y={top}px
      </div>

      {/* Active-day HUD (top-right) */}
      <div
        className="absolute top-3 right-3 rounded-lg px-3 py-2 font-mono text-xs shadow-lg"
        style={{
          background: "rgba(17, 24, 39, 0.92)",
          color: "#fff",
          minWidth: 110,
        }}
      >
        <div className="text-[10px] uppercase tracking-wider text-slate-300">
          scroll-sync
        </div>
        <div className="mt-0.5 text-lg leading-none font-bold">
          Day <span className="text-emerald-400">{activeDay}</span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400">
          vh {vh}px
        </div>
      </div>
    </div>
  );
}
