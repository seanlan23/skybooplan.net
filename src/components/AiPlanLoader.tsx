import { useEffect, useMemo, useState } from "react";
import { Plane, Sparkles, Lightbulb } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { AI_PLAN_TIP_KEYS, shuffleTipOrder } from "@/lib/aiPlanTips";

/**
 * Loader while the AI itinerary is generating.
 * Globe + orbiting plane (progress-linked), sky palette only.
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
    () => AI_PLAN_TIP_KEYS.map((key) => t(key)).filter(Boolean),
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

  const estimateSec = Math.min(120, Math.max(35, 25 + tripDays * 2.5));

  useEffect(() => {
    const id = setInterval(
      () => setPhase((p) => Math.min(p + 1, phases.length - 1)),
      3500,
    );
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // Plane completes more of the orbit as generation progresses.
  const orbitDeg = 40 + progress * 3.2;

  return (
    <div className="mt-8 rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-sky-50 via-white to-sky-100/80 p-8 sm:p-10 shadow-md">
      <div className="flex items-center justify-center gap-2 text-sm font-bold text-sky-600 uppercase tracking-wider">
        <Sparkles className="h-4 w-4 animate-pulse" />
        {t("aiplan.loadingHeader")}
      </div>

      {/* Globe + orbiting plane */}
      <div className="relative mx-auto mt-8 h-40 w-40 sm:h-44 sm:w-44" aria-hidden>
        {/* Soft atmosphere */}
        <div className="absolute inset-0 rounded-full bg-sky-200/40 blur-md" />

        {/* Orbit ring */}
        <div className="absolute inset-[10%] rounded-full border border-dashed border-sky-300/80" />
        <div className="absolute inset-[4%] rounded-full border border-sky-200/50" />

        {/* Earth */}
        <div className="absolute inset-[22%] overflow-hidden rounded-full shadow-[inset_-10px_-6px_20px_rgba(15,23,42,0.25),0_8px_24px_rgba(14,165,233,0.25)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_28%,#7dd3fc_0%,#0ea5e9_38%,#0369a1_72%,#0c4a6e_100%)]" />
          <div className="absolute inset-0 animate-[sky-globe-spin_28s_linear_infinite]">
            <div className="absolute left-[18%] top-[28%] h-[22%] w-[34%] rotate-[-18deg] rounded-[40%] bg-emerald-500/70" />
            <div className="absolute right-[14%] top-[36%] h-[18%] w-[22%] rotate-[12deg] rounded-[45%] bg-emerald-600/65" />
            <div className="absolute bottom-[22%] left-[30%] h-[16%] w-[40%] rounded-[50%] bg-teal-500/55" />
            <div className="absolute left-[-10%] top-[48%] h-[10%] w-[120%] rotate-[-8deg] bg-white/25 blur-[1px]" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-l from-slate-900/35 via-transparent to-transparent" />
        </div>

        {/* Orbiting plane — progresses around the globe as the plan builds */}
        <div
          className="absolute inset-0 transition-transform duration-700 ease-out"
          style={{ transform: `rotate(${orbitDeg}deg)` }}
        >
          <div className="absolute left-1/2 top-[6%] -translate-x-1/2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-sky-200 bg-white shadow-md">
              <Plane className="h-4 w-4 text-sky-600" style={{ transform: "rotate(45deg)" }} />
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
          <span key={phase} className="animate-fade-in">
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
          key={`${tipStep}-${tipIdx}`}
          className="mt-2 min-h-[3.5rem] text-sm leading-relaxed text-slate-700 animate-fade-in sm:text-base"
        >
          {tips[tipIdx]}
        </p>
      </div>
    </div>
  );
}
