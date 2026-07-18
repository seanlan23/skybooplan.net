import { useEffect, useMemo, useState } from "react";
import { Plane, Sparkles, Lightbulb } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { AI_PLAN_TIP_KEYS, shuffleTipOrder } from "@/lib/aiPlanTips";

/** Bundled Earth texture (local) — looks like the real planet, not green blobs. */
const EARTH_TEXTURE = "/earth-blue-marble.jpg";

/**
 * Loader while the AI itinerary is generating.
 * Real Earth texture + CSS-only plane orbit (smooth) + separate progress ring.
 */
export function AiPlanLoader({
  tripDays = 7,
  startedAt,
}: {
  tripDays?: number;
  startedAt?: number | null;
} = {}) {
  const { t, lang } = useI18n();

  const phases = useMemo(
    () => [
      t("aiplan.phase1"),
      t("aiplan.phase2"),
      t("aiplan.phase3"),
      t("aiplan.phase4"),
      t("aiplan.phase5"),
    ],
    [lang, t],
  );

  const tips = useMemo(
    () => AI_PLAN_TIP_KEYS.map((key) => t(key as never)).filter(Boolean),
    [lang, t],
  );

  const [phase, setPhase] = useState(0);
  const [tipOrder] = useState(() =>
    shuffleTipOrder(AI_PLAN_TIP_KEYS.length, Math.floor(Math.random() * AI_PLAN_TIP_KEYS.length)),
  );
  const [tipStep, setTipStep] = useState(0);
  const tipIdx = tipOrder[tipStep % tipOrder.length] ?? 0;
  const [progress, setProgress] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [earthOk, setEarthOk] = useState(true);

  const estimateSec = Math.min(120, Math.max(35, 25 + tripDays * 2.5));

  useEffect(() => {
    const id = setInterval(
      () => setPhase((p) => Math.min(p + 1, phases.length - 1)),
      3500,
    );
    return () => clearInterval(id);
  }, [phases.length]);

  useEffect(() => {
    const id = setInterval(() => setTipStep((s) => s + 1), 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const duration = estimateSec * 1000;
    const wallStart = startedAt ?? Date.now();
    const perfStart = performance.now();
    let raf = 0;
    const tick = (perfNow: number) => {
      const elapsedMs = startedAt ? Date.now() - wallStart : perfNow - perfStart;
      const tt = Math.min(1, elapsedMs / duration);
      const eased = 1 - Math.pow(1 - tt, 2);
      setProgress(eased * 95);
      setElapsedSec(Math.floor(elapsedMs / 1000));
      if (tt < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [estimateSec, startedAt]);

  const remainingSec = Math.max(0, estimateSec - elapsedSec);

  // Progress ring geometry
  const size = 176;
  const stroke = 3;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - progress / 100);

  return (
    <div
      key={lang}
      className="mt-8 rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 via-white to-sky-100/80 p-8 sm:p-10 shadow-md"
    >
      <div className="flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider text-sky-600">
        <Sparkles className="h-4 w-4 animate-pulse" />
        {t("aiplan.loadingHeader")}
      </div>

      <div className="relative mx-auto mt-8 h-44 w-44" aria-hidden>
        {/* Progress ring (separate from plane — no jank) */}
        <svg
          className="absolute inset-0 -rotate-90"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgb(186 230 253)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgb(14 165 233)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-300 ease-out"
          />
        </svg>

        {/* Soft atmosphere */}
        <div className="absolute inset-[12%] rounded-full bg-sky-300/30 blur-md" />

        {/* Earth sphere */}
        <div className="absolute inset-[18%] overflow-hidden rounded-full shadow-[inset_-12px_-8px_24px_rgba(15,23,42,0.35),0_10px_28px_rgba(14,165,233,0.28)]">
          {earthOk ? (
            <img
              src={EARTH_TEXTURE}
              alt=""
              draggable={false}
              className="h-full w-full scale-110 object-cover animate-[sky-earth-drift_40s_linear_infinite]"
              onError={() => setEarthOk(false)}
            />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_32%_30%,#7dd3fc_0%,#0284c7_45%,#0c4a6e_100%)]" />
          )}
          {/* Terminator / night side */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-slate-950/40 via-transparent to-white/10" />
        </div>

        {/* Dashed orbit path */}
        <div className="pointer-events-none absolute inset-[8%] rounded-full border border-dashed border-sky-400/70" />

        {/* Plane — pure CSS infinite orbit (never fights JS progress) */}
        <div className="absolute inset-0 animate-[sky-orbit_11s_linear_infinite]">
          <div className="absolute left-1/2 top-[4%] -translate-x-1/2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-sky-200 bg-white shadow-md">
              <Plane className="h-4 w-4 text-sky-600 rotate-45" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center">
        <div className="inline-flex items-center gap-3 text-base font-medium text-slate-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-600" />
          </span>
          <span key={`${lang}-${phase}`} className="animate-fade-in">
            {phases[phase]}
          </span>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          {remainingSec > 5
            ? t("aiplan.loadingEta").replace("{sec}", String(remainingSec))
            : t("aiplan.loadingAlmost")}
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-sky-100 bg-white/80 p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-700">
          <Lightbulb className="h-4 w-4" />
          {t("aiplan.tipsTitle")}
        </div>
        <p
          key={`${lang}-${tipStep}-${tipIdx}`}
          className="mt-2 min-h-[3.5rem] text-sm leading-relaxed text-slate-700 animate-fade-in sm:text-base"
        >
          {tips[tipIdx]}
        </p>
      </div>
    </div>
  );
}
