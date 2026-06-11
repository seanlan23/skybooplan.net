import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, Sparkles } from "lucide-react";
import type { TripSkeleton } from "@/lib/aiPlan.functions";
import { buildSkeletonDayPlans, skeletonToPreviewPlan } from "@/lib/aiPlan.functions";
import { TripMap } from "@/components/TripMap";
import { AiPlanDayCard } from "@/components/AiPlanDayCard";
import { AiPlanLoader } from "@/components/AiPlanLoader";
import { resolveErrorMessage, useI18n } from "@/lib/i18n";
import { parseLocalDate } from "@/lib/dateUtils";
import { DestinationInsightBanner } from "@/components/DestinationInsightBanner";
import { useDestinationContext } from "@/hooks/useDestinationContext";
import { PlannerChoicesSummary } from "@/components/PlannerChoicesSummary";
import { TripTotalBreakdown } from "@/components/TripTotalBreakdown";
import type { AiPlannerSubmit } from "@/components/AiPlannerPreview";
import type { TripFlightContext } from "@/lib/flightScheduling";
import type { StayInfo } from "@/components/HotelsSection";

export function AiPlanSkeletonView({
  skeleton,
  loading,
  expanding,
  error,
  stayInfo,
  tripDays,
  genStartedAt,
  destinationIata,
  departDate,
  language,
  flights,
  pax = 1,
  onExpandFull,
  plannerWishes,
  plannerForm,
}: {
  skeleton: TripSkeleton | null;
  loading: boolean;
  expanding: boolean;
  error: string | null;
  stayInfo?: StayInfo;
  tripDays?: number;
  genStartedAt?: number | null;
  destinationIata?: string;
  departDate?: string;
  language?: string;
  flights?: TripFlightContext;
  pax?: number;
  onExpandFull: () => void;
  plannerWishes?: string;
  plannerForm?: AiPlannerSubmit | null;
}) {
  const { t, lang } = useI18n();
  const { ctx: destCtx, loading: destLoading } = useDestinationContext(
    destinationIata ?? skeleton?.destinationIata,
    departDate ?? skeleton?.departDate,
    language ?? lang,
    {
      returnDate: skeleton?.returnDate,
      priorities: plannerForm?.tags,
      wishes: plannerWishes ?? plannerForm?.wishes,
    },
  );
  const [activeDay, setActiveDay] = useState(1);
  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const planOpts = useMemo(
    () => ({
      flights: flights ?? undefined,
      lang,
      originIata: skeleton?.originIata,
      destinationIata: destinationIata ?? skeleton?.destinationIata,
      returnFromIata: skeleton?.returnFromIata,
      destinationName: skeleton?.destinationName,
      pax: Math.max(1, pax),
      paceLabel: plannerForm?.pace,
    }),
    [
      flights,
      lang,
      skeleton?.originIata,
      destinationIata,
      skeleton?.destinationIata,
      skeleton?.returnFromIata,
      skeleton?.destinationName,
      pax,
      plannerForm?.pace,
    ],
  );
  const previewPlan = useMemo(
    () => (skeleton ? skeletonToPreviewPlan(skeleton, planOpts) : null),
    [skeleton, planOpts],
  );
  const dayPlans = useMemo(
    () => (skeleton ? buildSkeletonDayPlans(skeleton, planOpts) : []),
    [skeleton, planOpts],
  );
  const computedTotalEur = useMemo(
    () =>
      dayPlans.reduce(
        (sum, d) => sum + (d.dailyBudgetEur ?? 0) * Math.max(1, pax),
        0,
      ),
    [dayPlans, pax],
  );

  useEffect(() => {
    if (dayPlans.length) setActiveDay(dayPlans[0].day);
  }, [dayPlans]);

  useEffect(() => {
    if (!dayPlans.length) return;
    if (typeof window === "undefined") return;

    const THRESHOLD = 0.38;
    let rafId = 0;
    let lastDay = activeDay;

    const compute = () => {
      rafId = 0;
      const els = Array.from(dayRefs.current.entries());
      if (els.length === 0) return;
      const lineY = window.innerHeight * THRESHOLD;

      let bestDay = lastDay;
      let bestScore = Number.POSITIVE_INFINITY;
      let straddler: number | null = null;

      for (const [day, el] of els) {
        const r = el.getBoundingClientRect();
        if (r.top <= lineY && r.bottom >= lineY) {
          straddler = day;
          break;
        }
        const center = (r.top + r.bottom) / 2;
        const score = Math.abs(center - lineY);
        if (score < bestScore) {
          bestScore = score;
          bestDay = day;
        }
      }

      const next = straddler ?? bestDay;
      if (next !== lastDay) {
        lastDay = next;
        setActiveDay(next);
      }
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(compute);
    };

    rafId = window.requestAnimationFrame(compute);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayPlans]);

  if (loading) return <AiPlanLoader tripDays={tripDays} startedAt={genStartedAt} />;

  if (error) {
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        {resolveErrorMessage(t, error)}
      </div>
    );
  }

  if (!skeleton || !previewPlan) return null;

  const hasCoords = dayPlans.some(
    (d) =>
      (Number.isFinite(d.lat) && Number.isFinite(d.lng)) ||
      Boolean((d.city ?? "").trim()),
  );

  return (
    <div id="ai-plan" className="mt-8 space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 flex items-center justify-between gap-3 flex-wrap">
        <span>{t("skeleton.previewBadge")}</span>
        <button
          type="button"
          onClick={onExpandFull}
          disabled={expanding}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
        >
          {expanding ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("skeleton.expanding")}
            </>
          ) : (
            <>
              {t("skeleton.expandFull")}
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {(destCtx || destLoading || flights) && (
        <DestinationInsightBanner context={destCtx} loading={destLoading} flights={flights} />
      )}

      <div className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
              <Sparkles className="h-4 w-4" /> {t("skeleton.badge" as never)}
            </div>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">
              {skeleton.destinationName}
            </h2>
            <PlannerChoicesSummary form={plannerForm} />
            <p className="mt-2 text-slate-600 max-w-2xl leading-relaxed">{skeleton.summary}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              {t("aiplan.total" as never)}
            </div>
            <div className="text-3xl font-bold text-slate-900">€{computedTotalEur}</div>
            <TripTotalBreakdown pax={pax} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-5 lg:gap-6 items-start">
        <div className="space-y-5 min-w-0 order-2 lg:order-1">
          {dayPlans.map((d, idx) => {
            let checkOut = d.dateEnd ?? d.date;
            if (d.city) {
              let endIdx = idx;
              for (let j = idx + 1; j < dayPlans.length; j++) {
                if (dayPlans[j].city === d.city) endIdx = j;
                else break;
              }
              const lastDate = dayPlans[endIdx].dateEnd ?? dayPlans[endIdx].date;
              const parsed = parseLocalDate(lastDate);
              if (parsed) {
                parsed.setDate(parsed.getDate() + 1);
                const y = parsed.getFullYear();
                const m = String(parsed.getMonth() + 1).padStart(2, "0");
                const dd = String(parsed.getDate()).padStart(2, "0");
                checkOut = `${y}-${m}-${dd}`;
              } else {
                checkOut = lastDate;
              }
            }
            return (
              <AiPlanDayCard
                key={d.day}
                day={d}
                isActive={activeDay === d.day}
                isFirstInCity={idx === 0 || dayPlans[idx - 1].city !== d.city}
                lang={lang}
                pax={Math.max(1, pax)}
                stayInfo={stayInfo}
                accommodationMode={skeleton.accommodationMode}
                hotelRestEveryNDays={skeleton.hotelRestEveryNDays}
                plannerWishes={plannerWishes}
                totalTripDays={dayPlans.length}
                checkOut={checkOut}
                regionFallback={skeleton.destinationName}
                onSelect={() => {
                  setActiveDay(d.day);
                  if (typeof window !== "undefined" && window.innerWidth < 1024) {
                    document.getElementById("ai-trip-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }
                }}
                registerRef={(el) => {
                  if (el) dayRefs.current.set(d.day, el);
                  else dayRefs.current.delete(d.day);
                }}
              />
            );
          })}
        </div>

        {hasCoords && (
          <div
            id="ai-trip-map"
            className="order-1 lg:order-2 lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:max-h-screen lg:self-start lg:flex lg:flex-col min-h-[320px] overflow-hidden"
          >
            <div className="flex-1 min-h-[280px]">
              <TripMap plan={previewPlan} activeDay={activeDay} />
            </div>
            <p className="mt-2 text-xs text-slate-500 text-center hidden lg:block">
              {t("aiplan.mapHint" as never)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
