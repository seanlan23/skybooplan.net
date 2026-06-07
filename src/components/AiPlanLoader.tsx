import { useEffect, useMemo, useState } from "react";
import { Plane, Sparkles, Lightbulb } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { AI_PLAN_TIP_KEYS, shuffleTipOrder } from "@/lib/aiPlanTips";

/**
 * Loader prikazan med generiranjem AI plana.
 * Brez lažnih števcev — prikazuje napredek faze, animirano letalo
 * po poti in rotacijske potovalne nasvete.
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

  // Faze: ~3.5s vsaka
  useEffect(() => {
    const id = setInterval(
      () => setPhase((p) => Math.min(p + 1, phases.length - 1)),
      3500,
    );
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rotacija nasvetov: vsakih 4s, naključen vrstni red ob zagonu
  useEffect(() => {
    const id = setInterval(() => setTipStep((s) => s + 1), 4000);
    return () => clearInterval(id);
  }, []);

  // Vizualni napredek letala (0 → 95 %), usklajen z oceno trajanja
  useEffect(() => {
    const duration = estimateSec * 1000;
    const wallStart = startedAt ?? Date.now();
    const perfStart = performance.now();
    let raf = 0;
    const tick = (perfNow: number) => {
      const elapsedMs = startedAt
        ? Date.now() - wallStart
        : perfNow - perfStart;
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

  return (
    <div className="mt-8 rounded-3xl border-2 border-sky-200 bg-gradient-to-br from-white via-sky-50/40 to-orange-50/40 p-8 sm:p-10 shadow-md">
      <div className="flex items-center justify-center gap-2 text-sm font-bold text-sky-600 uppercase tracking-wider">
        <Sparkles className="h-4 w-4 animate-pulse" />
        {t("aiplan.loadingHeader")}
      </div>

      {/* Animirana pot z letalom */}
      <div className="relative mt-8 mx-auto max-w-xl h-14">
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed border-sky-300"
          aria-hidden
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out"
          style={{ left: `calc(${progress}% - 18px)` }}
        >
          <div className="h-9 w-9 rounded-full bg-white shadow-md border border-sky-200 flex items-center justify-center">
            <Plane className="h-5 w-5 text-sky-600 rotate-45" />
          </div>
        </div>
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-sky-500"
          aria-hidden
        />
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-orange-500"
          aria-hidden
        />
      </div>

      {/* Trenutna faza */}
      <div className="mt-6 text-center">
        <div className="inline-flex items-center gap-3 text-base font-medium text-slate-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-600" />
          </span>
          <span key={phase} className="animate-fade-in">{phases[phase]}</span>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          {remainingSec > 5
            ? t("aiplan.loadingEta").replace("{sec}", String(remainingSec))
            : t("aiplan.loadingAlmost")}
        </div>
      </div>

      {/* Rotacijski nasvet */}
      <div className="mt-8 rounded-2xl bg-white/70 border border-sky-100 p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-orange-600 uppercase tracking-wider">
          <Lightbulb className="h-4 w-4" />
          {t("aiplan.tipsTitle")}
        </div>
        <p
          key={`${tipStep}-${tipIdx}`}
          className="mt-2 text-sm sm:text-base text-slate-700 leading-relaxed animate-fade-in min-h-[3.5rem]"
        >
          {tips[tipIdx]}
        </p>
      </div>
    </div>
  );
}
