import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { type ActivityMapFocus, type MapFocusTarget } from "@/components/TripMap";
import { AiTripMapPanel } from "@/components/AiTripMapPanel";
import { AiPlanDayCard, StreamingDayPlaceholder, activityFocusKey } from "@/components/AiPlanDayCard";
import { POIDetailsModal } from "@/components/POIDetailsModal";
import { refreshPoiDetailsImage, type PoiDetailsData } from "@/lib/poiDetails.types";
import { DayScrollDebug } from "@/components/DayScrollDebug";
import { AiPlanLoader } from "@/components/AiPlanLoader";
import { resolveErrorMessage, useI18n } from "@/lib/i18n";
import { stripPlanTeaser } from "@/lib/planTeaser";
import { computeTripTotalBudgetEur } from "@/lib/tripBudget";
import { buildWeatherWidgetFallback } from "@/lib/weatherWidgetFallback";
import { useDestinationContext } from "@/hooks/useDestinationContext";
import { DestinationInsightBanner } from "@/components/DestinationInsightBanner";
import type { TripFlightContext } from "@/lib/flightScheduling";
import { parsePlannerInterestKeys } from "@/lib/plannerInterests";

/** Hold at each stop during "Predvajaj pot" after the fly animation settles. */
const PLAY_ROUTE_HOLD_MS = 2000;
/** Approximate flyTo duration (speed 0.8) — keeps step timing aligned with the map. */
const PLAY_ROUTE_FLY_ESTIMATE_MS = 3500;
const PLAY_ROUTE_STEP_MS = PLAY_ROUTE_HOLD_MS + PLAY_ROUTE_FLY_ESTIMATE_MS;
import { parseLocalDate } from "@/lib/dateUtils";
import type { StayInfo } from "@/components/HotelsSection";
import { PlannerChoicesSummary } from "@/components/PlannerChoicesSummary";
import { PlanIntroInsightBlocks } from "@/components/PlanIntroInsightBlocks";
import { ItineraryRouteOverview } from "@/components/ItineraryRouteOverview";
import { TripTotalBreakdown } from "@/components/TripTotalBreakdown";
import { TravelRequirements } from "@/components/TravelRequirements";
import { ReturnHomeCard } from "@/components/ReturnHomeCard";
import { SupportCard } from "@/components/SupportCard";
import { TransportDashboard } from "@/components/TransportDashboard";
import type { AiPlannerSubmit } from "@/components/AiPlannerPreview";
import {
  buildAppleMapsRoadTripUrl,
  buildGoogleMapsRoadTripUrl,
} from "@/lib/navigationService";

export type { StayInfo };

function roadTripMapStops(plan: AiTripPlan): string[] {
  const stops: string[] = [];
  const origin = plan.originPlace?.trim() || plan.originIata?.trim();
  if (origin) stops.push(origin);
  for (const day of plan.days ?? []) {
    const city = day.city?.trim() || day.focusName?.trim();
    if (!city) continue;
    if (stops[stops.length - 1]?.toLowerCase() === city.toLowerCase()) continue;
    stops.push(city);
  }
  const dest = plan.destinationPlace?.trim();
  if (dest && stops[stops.length - 1]?.toLowerCase() !== dest.toLowerCase()) {
    // Destination often already appears as a day city — only append if missing.
    if (!stops.some((s) => s.toLowerCase() === dest.toLowerCase())) {
      stops.push(dest);
    }
  }
  return stops;
}

function scrollElementIntoPlanColumn(
  container: HTMLElement,
  el: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const cr = container.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  const targetTop = er.top - cr.top + container.scrollTop - cr.height * 0.12;
  container.scrollTo({ top: Math.max(0, targetTop), behavior });
}

function planUsesColumnScroll(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= 1024;
}

export function AiPlanView({
  loading,
  plan,
  error,
  stayInfo,
  protect = false,
  onDownloadClick,
  onClearPlan,
  pax = 1,
  plannerWishes,
  plannerForm,
  streaming = false,
  expectedDayCount = 0,
  destinationIata,
  departDate,
  returnDate,
  flights,
}: {
  loading: boolean;
  plan: AiTripPlan | null;
  error: string | null;
  stayInfo?: StayInfo;
  protect?: boolean;
  onDownloadClick?: () => void;
  /** Clear persisted plan only (keep search / hero context). */
  onClearPlan?: () => void;
  pax?: number;
  plannerWishes?: string;
  plannerForm?: AiPlannerSubmit | null;
  /** True while Gemini stream is still producing days. */
  streaming?: boolean;
  /** Total trip days — used to render placeholders for not-yet-streamed days. */
  expectedDayCount?: number;
  destinationIata?: string;
  departDate?: string;
  returnDate?: string;
  flights?: TripFlightContext | null;
}) {
  const { t, lang, formatMoney } = useI18n();
  const [activeDay, setActiveDay] = useState<number>(1);
  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const planScrollRef = useRef<HTMLDivElement>(null);
  const focusKeyRef = useRef(0);
  const [mapFocus, setMapFocus] = useState<MapFocusTarget | null>(null);
  const [poiModal, setPoiModal] = useState<PoiDetailsData | null>(null);
  const [poiModalOpen, setPoiModalOpen] = useState(false);
  const [scrollSpyPaused, setScrollSpyPaused] = useState(false);
  const [focusedActivityKey, setFocusedActivityKey] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const isClickNavigatingRef = useRef(false);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const clickNavTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCoords = useMemo(
    () =>
      Boolean(
        plan?.days.some(
          (d) =>
            (Number.isFinite(d.lat) && Number.isFinite(d.lng)) ||
            Boolean((d.city ?? "").trim()) ||
            Boolean((d.focusName ?? "").trim()),
        ),
      ),
    [plan?.days],
  );

  const plannerPriorities = useMemo(
    () => parsePlannerInterestKeys(plannerForm?.tags),
    [plannerForm?.tags],
  );
  const { ctx: destCtx, loading: destLoading } = useDestinationContext(
    destinationIata ?? plan?.destinationIata,
    departDate ?? plan?.days[0]?.date,
    lang,
    {
      returnDate,
      priorities: plannerPriorities,
      wishes: plannerWishes,
    },
  );

  const weatherFallback = useMemo(
    () =>
      plan
        ? buildWeatherWidgetFallback({
            destinationIata: destinationIata ?? plan.destinationIata,
            departDate: departDate ?? plan.days[0]?.date,
            returnDate,
            lang,
            priorities: plannerPriorities,
            wishes: plannerWishes,
            context: destCtx,
            planSummary: stripPlanTeaser(plan.summary, lang),
          })
        : null,
    [
      plan,
      destinationIata,
      departDate,
      returnDate,
      lang,
      plannerPriorities,
      plannerWishes,
      destCtx,
    ],
  );

  const displayTotalBudget = useMemo(() => {
    if (!plan?.days.length) return 0;
    if (plan.totalBudgetEur > 0) return plan.totalBudgetEur;
    return computeTripTotalBudgetEur(plan.days, Math.max(1, pax));
  }, [plan?.totalBudgetEur, plan?.days, pax]);

  const pauseScrollSpy = useCallback((ms = 3000) => {
    isClickNavigatingRef.current = true;
    setScrollSpyPaused(true);
    if (clickNavTimerRef.current) clearTimeout(clickNavTimerRef.current);
    clickNavTimerRef.current = setTimeout(() => {
      isClickNavigatingRef.current = false;
      setScrollSpyPaused(false);
      clickNavTimerRef.current = null;
    }, ms);
  }, []);

  const scrollDayIntoView = useCallback((dayNum: number) => {
    const el = dayRefs.current.get(dayNum);
    if (!el) return;
    const scrollRoot = planScrollRef.current;
    if (scrollRoot && planUsesColumnScroll()) {
      scrollElementIntoPlanColumn(scrollRoot, el);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const handleDaySelect = useCallback(
    (day: DayPlan) => {
      isClickNavigatingRef.current = true;
      setScrollSpyPaused(true);
      setFocusedActivityKey(null);
      focusKeyRef.current += 1;
      setActiveDay(day.day);
      setMapFocus({
        lat: day.lat ?? 0,
        lng: day.lng ?? 0,
        day: day.day,
        mode: "day",
        key: focusKeyRef.current,
      });
      scrollDayIntoView(day.day);
      if (clickNavTimerRef.current) clearTimeout(clickNavTimerRef.current);
      clickNavTimerRef.current = setTimeout(() => {
        isClickNavigatingRef.current = false;
        setScrollSpyPaused(false);
        clickNavTimerRef.current = null;
      }, 2600);
      if (typeof window !== "undefined" && !planUsesColumnScroll()) {
        document.getElementById("ai-trip-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [scrollDayIntoView],
  );

  const handleMapCitySelect = useCallback(
    (dayNum: number) => {
      const day = plan?.days.find((d) => d.day === dayNum);
      if (day) handleDaySelect(day);
    },
    [plan?.days, handleDaySelect],
  );

  const handleActivityFocus = useCallback(
    (coords: ActivityMapFocus) => {
      pauseScrollSpy(4000);
      focusKeyRef.current += 1;
      setActiveDay(coords.day);
      if (coords.poiName) {
        setFocusedActivityKey(activityFocusKey(coords.day, coords.poiName));
      }
      setMapFocus({
        lat: coords.lat,
        lng: coords.lng,
        day: coords.day,
        poiName: coords.poiName,
        mode: "drone",
        key: focusKeyRef.current,
      });
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        window.setTimeout(() => {
          document.getElementById("ai-trip-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    },
    [pauseScrollSpy],
  );

  const handleActivityDetails = useCallback(
    (poi: PoiDetailsData) => {
      const day = plan?.days.find((d) => d.day === poi.day);
      const resolved = day ? refreshPoiDetailsImage(poi, day) : poi;
      setPoiModal({ ...resolved, destinationName: plan?.destinationName });
      setPoiModalOpen(true);
      if (
        poi.lat != null &&
        poi.lng != null &&
        Number.isFinite(poi.lat) &&
        Number.isFinite(poi.lng) &&
        poi.lat !== 0 &&
        poi.lng !== 0
      ) {
        handleActivityFocus({
          lat: poi.lat,
          lng: poi.lng,
          day: poi.day ?? day?.day ?? 1,
          poiName: poi.name,
        });
      }
    },
    [plan, handleActivityFocus],
  );

  useEffect(() => {
    if (!poiModalOpen || !poiModal || !plan) return;
    const day = plan.days.find((d) => d.day === poiModal.day);
    if (!day) return;
    const refreshed = refreshPoiDetailsImage(poiModal, day);
    if (refreshed.imageUrl !== poiModal.imageUrl) {
      setPoiModal({ ...refreshed, destinationName: plan.destinationName });
    }
  }, [plan, poiModal, poiModalOpen]);

  const sortedDayNumbers = useMemo(
    () => (plan?.days ?? []).map((d) => d.day).sort((a, b) => a - b),
    [plan?.days],
  );

  const handleTogglePlayback = useCallback(() => {
    setIsPlaying((playing) => {
      if (playing) {
        setScrollSpyPaused(false);
        isClickNavigatingRef.current = false;
        return false;
      }
      const firstDay = sortedDayNumbers[0] ?? 1;
      setActiveDay(firstDay);
      setMapFocus(null);
      setScrollSpyPaused(true);
      isClickNavigatingRef.current = true;
      return true;
    });
  }, [sortedDayNumbers]);

  // Auto-advance during route playback — fly animation + hold per stop.
  useEffect(() => {
    if (!isPlaying || sortedDayNumbers.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveDay((current) => {
        const idx = sortedDayNumbers.indexOf(current);
        const nextIdx = idx < 0 ? 0 : idx + 1;
        if (nextIdx >= sortedDayNumbers.length) {
          window.setTimeout(() => {
            setIsPlaying(false);
            setScrollSpyPaused(false);
            isClickNavigatingRef.current = false;
          }, 0);
          return sortedDayNumbers[sortedDayNumbers.length - 1]!;
        }
        return sortedDayNumbers[nextIdx]!;
      });
    }, PLAY_ROUTE_STEP_MS);

    return () => window.clearInterval(timer);
  }, [isPlaying, sortedDayNumbers]);

  const tripSessionKey = useMemo(() => {
    if (!plan?.days.length) return "";
    return [
      plan.destinationIata ?? plan.destinationName ?? "",
      plan.originIata ?? plan.originPlace ?? "",
    ].join("|");
  }, [
    plan?.destinationIata,
    plan?.destinationName,
    plan?.originIata,
    plan?.originPlace,
    plan?.days.length,
  ]);

  // Keep sidebar in sync while the map plays through days.
  useEffect(() => {
    if (!isPlaying) return;
    scrollDayIntoView(activeDay);
  }, [activeDay, isPlaying, scrollDayIntoView]);

  useEffect(() => {
    if (!plan?.days?.length || !tripSessionKey) return;
    setActiveDay(plan.days[0].day);
    setMapFocus(null);
  }, [tripSessionKey]);

  // Track active day while scrolling — IntersectionObserver + scroll fallback.
  useEffect(() => {
    if (!plan) return;
    if (typeof window === "undefined") return;

    let observer: IntersectionObserver | null = null;
    let retryTimer = 0;
    let rafId = 0;
    let scrollTarget: HTMLElement | Window = window;

    const scrollRoot = () => {
      if (planUsesColumnScroll()) return planScrollRef.current;
      return null;
    };

    const pickActiveDay = () => {
      if (isClickNavigatingRef.current || isPlayingRef.current) return;

      const els = Array.from(dayRefs.current.entries());
      if (els.length === 0) return;

      const root = scrollRoot();
      const rootRect = root?.getBoundingClientRect();
      const lineY = rootRect
        ? rootRect.top + rootRect.height * 0.38
        : window.innerHeight * 0.38;
      let bestDay: number | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const [day, el] of els) {
        const r = el.getBoundingClientRect();
        if (r.top <= lineY && r.bottom >= lineY) {
          setActiveDay((prev) => (prev === day ? prev : day));
          return;
        }
        const center = (r.top + r.bottom) / 2;
        const score = Math.abs(center - lineY);
        if (score < bestScore) {
          bestScore = score;
          bestDay = day;
        }
      }
      if (bestDay != null) setActiveDay((prev) => (prev === bestDay ? prev : bestDay));
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        pickActiveDay();
      });
    };

    const attach = () => {
      const els = Array.from(dayRefs.current.values());
      if (els.length === 0) return false;

      observer?.disconnect();
      const root = scrollRoot();
      scrollTarget = root ?? window;
      observer = new IntersectionObserver(
        (entries) => {
          if (isClickNavigatingRef.current || isPlayingRef.current) return;

          let bestDay: number | null = null;
          let bestRatio = 0;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const day = Number((entry.target as HTMLElement).dataset.day);
            if (!Number.isFinite(day)) continue;
            if (entry.intersectionRatio > bestRatio) {
              bestRatio = entry.intersectionRatio;
              bestDay = day;
            }
          }
          if (bestDay != null) setActiveDay((prev) => (prev === bestDay ? prev : bestDay));
        },
        {
          root,
          threshold: [0, 0.2, 0.4, 0.6, 0.8, 1],
          rootMargin: "-18% 0px -38% 0px",
        },
      );

      els.forEach((el) => observer!.observe(el));
      pickActiveDay();
      return true;
    };

    const bindScroll = () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      if (!attach()) {
        retryTimer = window.setTimeout(bindScroll, 120);
        return;
      }
      scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    };

    bindScroll();
    window.addEventListener("resize", bindScroll);

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", bindScroll);
    };
  }, [plan, plan?.days.length]);

  if (loading && !plan) {
    return <AiPlanLoader />;
  }

  if (error && !plan) {
    return (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        {resolveErrorMessage(t, error)}
      </div>
    );
  }

  if (!plan) return null;

  const totalExpectedDays = expectedDayCount > 0 ? expectedDayCount : plan.days.length;
  const pendingDayNumbers: number[] = [];
  if (streaming && totalExpectedDays > plan.days.length) {
    const existing = new Set(plan.days.map((d) => d.day));
    for (let d = 1; d <= totalExpectedDays; d++) {
      if (!existing.has(d)) pendingDayNumbers.push(d);
    }
  }

  const mapHint = t("aiplan.mapHint" as never);
  const mapPlayLabel = t("aiplan.mapPlay" as never);
  const mapStopLabel = t("aiplan.mapStop" as never);
  const displaySummary = stripPlanTeaser(plan.summary, lang);
  const roadTripStops = useMemo(() => roadTripMapStops(plan), [plan]);
  const showRoadTripMaps =
    (plan.groundTransportMode === "motorhome" ||
      plan.groundTransportMode === "car" ||
      plan.accommodationMode === "motorhome") &&
    roadTripStops.length >= 2;
  const isGenerating = streaming || pendingDayNumbers.length > 0;

  return (
    <div
      id="ai-plan"
      className={`mt-4 sm:mt-8 space-y-4 sm:space-y-5 relative w-full min-w-0 ${protect ? "select-none" : ""}`}
      style={
        protect
          ? {
              userSelect: "none",
              WebkitUserSelect: "none",
              MozUserSelect: "none",
              msUserSelect: "none",
              WebkitTouchCallout: "none",
            }
          : undefined
      }
      onContextMenu={protect ? (e) => e.preventDefault() : undefined}
      onCopy={protect ? (e) => e.preventDefault() : undefined}
      onCut={protect ? (e) => e.preventDefault() : undefined}
      onDragStart={protect ? (e) => e.preventDefault() : undefined}
    >
      <DayScrollDebug activeDay={activeDay} threshold={0.38} />

      {protect && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-2xl"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, rgba(2,132,199,0.07) 0 60px, rgba(2,132,199,0.0) 60px 220px)",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rotate-[-22deg] text-4xl sm:text-6xl font-black text-sky-900/10 tracking-widest">
                {t("aiplan.previewWatermark")}
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            🔒 {t("aiplan.previewLockNotice")}
          </div>
        </>
      )}

      {(onDownloadClick || onClearPlan) && (
        <div className="flex flex-col items-end gap-2 relative z-20">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onClearPlan && !streaming ? (
              <button
                type="button"
                onClick={onClearPlan}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              >
                {t("aiplan.clearPlan" as never)}
              </button>
            ) : null}
            {onDownloadClick ? (
              <button
                type="button"
                onClick={onDownloadClick}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-shadow hover:bg-sky-600 hover:shadow-lg"
              >
                <span aria-hidden>⬇</span> {t("aiplan.downloadPdf" as never)}
              </button>
            ) : null}
          </div>
          {onDownloadClick ? (
            <p className="text-xs text-slate-500 max-w-sm text-right">
              {t("aiplan.pdfNotice" as never)}
            </p>
          ) : null}
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {resolveErrorMessage(t, error)}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {t("aiplan.badge" as never)}
            </p>
            <h2 className="mt-0.5 text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 leading-tight tracking-tight">
              {plan.destinationName}
            </h2>
            <ItineraryRouteOverview plan={plan} />
            {showRoadTripMaps ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={buildGoogleMapsRoadTripUrl(roadTripStops)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  {t("heroChat.motorhome.openGoogleMaps" as never)}
                </a>
                <a
                  href={buildAppleMapsRoadTripUrl(
                    roadTripStops[0]!,
                    roadTripStops[roadTripStops.length - 1]!,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  {t("heroChat.motorhome.openAppleMaps" as never)}
                </a>
              </div>
            ) : null}
            <DestinationInsightBanner
              context={destCtx}
              flights={flights}
              loading={destLoading}
            />
            <PlanIntroInsightBlocks
              plan={plan}
              weatherFallback={weatherFallback}
              className="mt-3"
            />
            <div className="mt-4">
              <TravelRequirements
                requirements={plan.travelRequirements}
                originIata={plan.originIata}
                destinationIata={plan.destinationIata}
              />
            </div>
            <PlannerChoicesSummary form={plannerForm} className="mt-4" />
            {displaySummary ? (
              <p className="mt-2 text-slate-600 max-w-2xl text-sm leading-relaxed">{displaySummary}</p>
            ) : null}
            {streaming && (
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-sky-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-600" />
                </span>
                {t("aiplan.streamingProgress")
                  .replace("{n}", String(plan.days.length))
                  .replace("{total}", String(totalExpectedDays))}
              </p>
            )}
          </div>
          <div className="sm:text-right shrink-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              {t("aiplan.total" as never)}
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-slate-900">
              {formatMoney(displayTotalBudget)}
            </div>
            <TripTotalBreakdown
              pax={pax}
              motorhome={
                plan.groundTransportMode === "motorhome" ||
                plan.accommodationMode === "motorhome"
              }
            />
          </div>
        </div>
      </div>

      <SupportCard isGenerating={isGenerating} />

      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_1.3fr] gap-4 sm:gap-5 lg:gap-6 lg:items-start w-full">
        <div
          ref={planScrollRef}
          className="space-y-4 sm:space-y-5 min-w-0 w-full order-1 lg:h-[calc(100vh-120px)] lg:overflow-y-auto lg:overscroll-contain"
        >
          {plan.groundJourney && <TransportDashboard plan={plan} />}
          {plan.days.map((d, idx) => {
            let checkOut = d.date;
            if (d.city) {
              let endIdx = idx;
              for (let j = idx + 1; j < plan.days.length; j++) {
                if (plan.days[j].city === d.city) endIdx = j;
                else break;
              }
              const lastDate = plan.days[endIdx].date;
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
              <div key={d.day}>
                <AiPlanDayCard
                  day={d}
                  isActive={activeDay === d.day}
                  isFirstInCity={idx === 0 || plan.days[idx - 1].city !== d.city}
                  lang={lang}
                  pax={Math.max(1, pax)}
                  stayInfo={stayInfo}
                  accommodationMode={plan.accommodationMode}
                  hotelRestEveryNDays={plan.hotelRestEveryNDays}
                  plannerWishes={plannerWishes}
                  totalTripDays={plan.days.length}
                  checkOut={checkOut}
                  regionFallback={plan.destinationName}
                  onSelect={() => handleDaySelect(d)}
                  onActivityFocus={handleActivityFocus}
                  onActivityDetails={handleActivityDetails}
                  focusedActivityKey={focusedActivityKey}
                  registerRef={(el) => {
                    if (el) dayRefs.current.set(d.day, el);
                    else dayRefs.current.delete(d.day);
                  }}
                />
              </div>
            );
          })}
          {pendingDayNumbers.map((dayNum, i) => (
            <div key={`pending-${dayNum}`}>
              <StreamingDayPlaceholder dayNumber={dayNum} isGenerating={i === 0} />
            </div>
          ))}
          {!streaming && <ReturnHomeCard plan={plan} />}
        </div>

        {hasCoords && (
          <AiTripMapPanel
            plan={plan}
            activeDay={activeDay}
            hasCoords={hasCoords}
            focusTarget={mapFocus}
            scrollSpyPaused={scrollSpyPaused || isPlaying}
            onDaySelect={handleMapCitySelect}
            onOpenPoiDetails={handleActivityDetails}
            streaming={streaming}
            expectedDayCount={totalExpectedDays}
            mapHint={mapHint}
            isPlaying={isPlaying}
            onTogglePlayback={handleTogglePlayback}
            playLabel={mapPlayLabel}
            stopLabel={mapStopLabel}
          />
        )}
      </div>

      <POIDetailsModal
        open={poiModalOpen}
        onOpenChange={setPoiModalOpen}
        poi={poiModal}
      />
    </div>
  );
}
