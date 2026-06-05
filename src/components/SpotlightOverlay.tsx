import { useEffect, useState } from "react";
import { X, Sparkles } from "lucide-react";

type Rect = { top: number; left: number; width: number; height: number };

export function SpotlightOverlay({
  targetSelector,
  message,
  onDismiss,
}: {
  targetSelector: string;
  message: string;
  onDismiss: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    function measure() {
      const el = document.querySelector(targetSelector) as HTMLElement | null;
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // measure after layout settles
    const t = setTimeout(measure, 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [targetSelector, onDismiss]);

  if (!rect) return null;

  const pad = 10;
  const holeStyle: React.CSSProperties = {
    position: "fixed",
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 20,
    boxShadow: "0 0 0 9999px rgba(8, 12, 24, 0.72)",
    pointerEvents: "none",
    zIndex: 60,
    transition: "all 0.3s ease",
  };

  const pulseStyle: React.CSSProperties = {
    position: "fixed",
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 20,
    pointerEvents: "none",
    zIndex: 61,
    boxShadow: "0 0 0 3px hsl(var(--brand, 24 95% 55%))",
    animation: "spotlight-pulse 1.6s ease-in-out infinite",
  };

  const tipTop = rect.top + rect.height + 18;
  const tipLeft = Math.max(16, Math.min(rect.left, window.innerWidth - 320));

  return (
    <>
      <div style={holeStyle} />
      <div style={pulseStyle} />
      <div
        className="fixed z-[62] w-[300px] rounded-2xl bg-card border border-border p-4 shadow-2xl"
        style={{ top: tipTop, left: tipLeft }}
      >
        <div className="flex items-start gap-2">
          <Sparkles className="h-5 w-5 text-brand shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-foreground">{message}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Klikni gumb in AI bo pripravil personaliziran plan.
            </div>
          </div>
          <button
            onClick={onDismiss}
            aria-label="Zapri"
            className="p-1 rounded-full hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {/* Click-catch outside hole to dismiss */}
      <button
        aria-label="Zapri vodnik"
        onClick={onDismiss}
        className="fixed inset-0 z-[59] cursor-default"
        style={{ background: "transparent" }}
      />
    </>
  );
}
