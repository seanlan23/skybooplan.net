import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import { tripPlanResponseToAiTripPlan } from "@/lib/geminiPlanMap";
import { TripMap } from "@/components/TripMap";
import { AiPlanDayCard } from "@/components/AiPlanDayCard";
import { GeminiLogisticsCards } from "@/components/GeminiLogisticsCards";
import { DestinationInsightBanner } from "@/components/DestinationInsightBanner";
import { PlanIntroInsightBlocks } from "@/components/PlanIntroInsightBlocks";
import { ItineraryRouteOverview } from "@/components/ItineraryRouteOverview";
import { MobileMapCloseBar, MobileMapOpenButton } from "@/components/MobileMapOverlay";
import { useDestinationContext } from "@/hooks/useDestinationContext";
import { useI18n } from "@/lib/i18n";
import { parseLocalDate } from "@/lib/dateUtils";
import { PlannerChoicesSummary } from "@/components/PlannerChoicesSummary";
import type { AiPlannerSubmit } from "@/components/AiPlannerPreview";
import type { StayInfo } from "@/components/HotelsSection";
import type { TripFlightContext } from "@/lib/flightScheduling";

interface TripComponentProps {
  data: TripPlanResponse;
  originIata?: string;
  destinationIata?: string;
  departDate?: string;
  returnDate?: string;
  language?: string;
  flights?: TripFlightContext;
  pax?: number;
  plannerForm?: AiPlannerSubmit | null;
  plannerWishes?: string;
  stayInfo?: StayInfo;
}

export default function TripComponent({
  data,
  originIata,
  destinationIata,
  departDate,
  returnDate,
  language,
  flights,
  pax = 1,
  plannerForm,
  plannerWishes,
  stayInfo,
}: TripComponentProps) {
  const { t, lang } = useI18n();
  const uiLang = language || lang;
  const [activeDay, setActiveDay] = useState(1);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!mobileMapOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMapOpen]);

  const meta = data?.trip_metadata;
  const logistics = data?.logistics_and_tips;

  const mapPlan = useMemo(
    () =>
      tripPlanResponseToAiTripPlan(data, {
        originIata,
        destinationIata,
        departDate,
      }),
    [data, originIata, destinationIata, departDate],
  );

  const planRegionCities = useMemo(() => {
    const cities = mapPlan.days.map((d) => (d.city ?? "").trim()).filter(Boolean);
    return [...new Set(cities)];
  }, [mapPlan.days]);

  const { ctx: destCtx, loading: destLoading } = useDestinationContext(
    destinationIata,
    departDate,
    uiLang,
    {
      returnDate,
      priorities: plannerForm?.tags,
      wishes: plannerWishes ?? plannerForm?.wishes,
      regionCities: planRegionCities.length > 0 ? planRegionCities : undefined,
    },
  );

  useEffect(() => {
    if (mapPlan.days.length > 0) setActiveDay(mapPlan.days[0].day);
  }, [mapPlan]);

  useEffect(() => {
    if (mapPlan.days.length === 0) return;
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
  }, [mapPlan]);

  if (!meta || mapPlan.days.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-900 text-sm">
        {t("error.planUnexpectedFormat")}
      </div>
    );
  }

  const hasCoords = mapPlan.days.some(
    (d) =>
      (Number.isFinite(d.lat) && Number.isFinite(d.lng) && d.lat !== 0 && d.lng !== 0) ||
      Boolean((d.city ?? "").trim()) ||
      Boolean((d.focusName ?? "").trim()) ||
      (d.mapPins?.length ?? 0) > 0,
  );

  return (
    <div id="ai-plan" className="mt-8 space-y-5">
      {(destCtx || destLoading || flights) && (
        <DestinationInsightBanner context={destCtx} loading={destLoading} flights={flights} />
      )}

      <div className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
              <Sparkles className="h-4 w-4" /> {t("aiplan.badge" as never)}
            </div>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">
              {meta.destination}
            </h2>
            <ItineraryRouteOverview plan={mapPlan} />
            <PlannerChoicesSummary form={plannerForm} />
            <PlanIntroInsightBlocks plan={mapPlan} className="mt-3" />
            {meta.season_warning ? (
              <p className="mt-2 text-slate-600 max-w-2xl text-sm leading-relaxed">{meta.season_warning}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,440px)] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          {mapPlan.days.map((d, idx) => {
            let checkOut = d.date;
            if (d.city) {
              let endIdx = idx;
              for (let j = idx + 1; j < mapPlan.days.length; j++) {
                if (mapPlan.days[j].city === d.city) endIdx = j;
                else break;
              }
              const lastDate = mapPlan.days[endIdx].date;
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

            const prevCity = idx > 0 ? mapPlan.days[idx - 1].city : "";
            const showPhaseHeader = idx === 0 || d.city !== prevCity;

            return (
              <div key={d.day} className="space-y-3">
                {showPhaseHeader && d.city ? (
                  <h3 className="text-sm font-bold uppercase tracking-wider text-sky-700 border-l-4 border-sky-500 pl-3">
                    {d.city}
                  </h3>
                ) : null}
                <AiPlanDayCard
                  day={d}
                  isActive={activeDay === d.day}
                  isFirstInCity={idx === 0 || mapPlan.days[idx - 1].city !== d.city}
                  lang={uiLang}
                  pax={Math.max(1, pax)}
                  stayInfo={stayInfo}
                  accommodationMode="hotel"
                  groundTransportMode={mapPlan.groundTransportMode}
                  plannerWishes={plannerWishes}
                  totalTripDays={mapPlan.days.length}
                  checkOut={checkOut}
                  regionFallback={mapPlan.destinationName}
                  onSelect={() => {
                    setActiveDay(d.day);
                    if (typeof window !== "undefined" && window.innerWidth < 1024) {
                      setMobileMapOpen(true);
                    }
                  }}
                  registerRef={(el) => {
                    if (el) dayRefs.current.set(d.day, el);
                    else dayRefs.current.delete(d.day);
                  }}
                />
              </div>
            );
          })}

          <GeminiLogisticsCards
            logistics={logistics}
            currency={meta.currency}
            visaRequired={meta.visa_required}
          />
        </div>

        {hasCoords ? (
          <div
            id="ai-trip-map"
            className="hidden lg:block lg:sticky lg:top-24 scroll-mt-24"
          >
            <TripMap plan={mapPlan} activeDay={activeDay} />
            <p className="mt-2 text-xs text-slate-500 text-center">
              {t("aiplan.mapHint" as never)}
            </p>
          </div>
        ) : null}
      </div>

      {hasCoords &&
        mobileMapOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex flex-col bg-background lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t("aiplan.mapStreets" as never)}
          >
            <MobileMapCloseBar onClose={() => setMobileMapOpen(false)} />
            <div className="min-h-0 flex-1">
              <TripMap plan={mapPlan} activeDay={activeDay} />
            </div>
          </div>,
          document.body,
        )}

      <MobileMapOpenButton
        visible={hasCoords && !mobileMapOpen}
        onClick={() => setMobileMapOpen(true)}
      />
    </div>
  );
}
