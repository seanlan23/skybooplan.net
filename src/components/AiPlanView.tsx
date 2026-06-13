import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { type ActivityMapFocus, type MapFocusTarget } from "@/components/TripMap";
import { AiTripMapPanel } from "@/components/AiTripMapPanel";
import { AiPlanDayCard, StreamingDayPlaceholder } from "@/components/AiPlanDayCard";
import { POIDetailsModal } from "@/components/POIDetailsModal";
import { refreshPoiDetailsImage, type PoiDetailsData } from "@/lib/poiDetails.types";
import { DayScrollDebug } from "@/components/DayScrollDebug";
import { AiPlanLoader } from "@/components/AiPlanLoader";
import { resolveErrorMessage, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  PAYWALL_LOCKED_FROM_INDEX,
  PAYWALL_FREE_DAYS,
  isPromoUnlockCode,
  withPlanTeaser,
} from "@/lib/planTeaser";
import { Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { parseLocalDate } from "@/lib/dateUtils";
import type { StayInfo } from "@/components/HotelsSection";
import { PlannerChoicesSummary } from "@/components/PlannerChoicesSummary";
import { WeatherSummaryCard } from "@/components/WeatherSummaryCard";
import { TripTotalBreakdown } from "@/components/TripTotalBreakdown";
import { TravelRequirements } from "@/components/TravelRequirements";
import { ReturnHomeCard } from "@/components/ReturnHomeCard";
import { TransportDashboard } from "@/components/TransportDashboard";
import type { AiPlannerSubmit } from "@/components/AiPlannerPreview";

export type { StayInfo };

function PaywallUnlockSection({
  onUnlockClick,
  onPromoUnlock,
}: {
  onUnlockClick?: () => void;
  onPromoUnlock: () => void;
}) {
  const { t } = useI18n();
  const [giftCode, setGiftCode] = useState("");

  const handleApplyCode = () => {
    if (isPromoUnlockCode(giftCode)) {
      onPromoUnlock();
      setGiftCode("");
    }
  };

  return (
    <div className="mb-4 flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onUnlockClick}
        className="inline-flex w-full sm:w-auto sm:max-w-lg items-center justify-center gap-2.5 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-600 to-violet-600 px-4 sm:px-6 py-3 sm:py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200/50 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-300/40"
      >
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        {t("paywall.unlockPlanCta")}
      </button>
      <div className="flex w-full max-w-sm items-center gap-2">
        <Input
          type="text"
          value={giftCode}
          onChange={(e) => setGiftCode(e.target.value)}
          placeholder={t("paywall.giftCodePrompt")}
          aria-label={t("paywall.giftCodePrompt")}
          className="h-9 flex-1 border-slate-200 bg-slate-50/80 text-sm text-slate-600 placeholder:text-slate-400 shadow-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApplyCode();
          }}
        />
        <button
          type="button"
          onClick={handleApplyCode}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          {t("paywall.giftCodeApply")}
        </button>
      </div>
    </div>
  );
}

export function AiPlanView({
  loading,
  plan,
  error,
  stayInfo,
  protect = false,
  isUnlocked = true,
  onUnlockClick,
  onDownloadClick,
  pax = 1,
  plannerWishes,
  plannerForm,
  streaming = false,
  expectedDayCount = 0,
}: {
  loading: boolean;
  plan: AiTripPlan | null;
  error: string | null;
  stayInfo?: StayInfo;
  protect?: boolean;
  /** When false and plan has more than 3 days, days 4+ are blurred behind paywall. */
  isUnlocked?: boolean;
  onUnlockClick?: () => void;
  onDownloadClick?: () => void;
  pax?: number;
  plannerWishes?: string;
  plannerForm?: AiPlannerSubmit | null;
  /** True while Gemini stream is still producing days. */
  streaming?: boolean;
  /** Total trip days — used to render placeholders for not-yet-streamed days. */
  expectedDayCount?: number;
}) {
  const { t, lang, formatMoney } = useI18n();
  const [activeDay, setActiveDay] = useState<number>(1);
  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const focusKeyRef = useRef(0);
  const [mapFocus, setMapFocus] = useState<MapFocusTarget | null>(null);
  const [poiModal, setPoiModal] = useState<PoiDetailsData | null>(null);
  const [poiModalOpen, setPoiModalOpen] = useState(false);
  const [scrollSpyPaused, setScrollSpyPaused] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [promoUnlocked, setPromoUnlocked] = useState(false);
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

  const handleActivityFocus = useCallback(
    (coords: ActivityMapFocus) => {
      pauseScrollSpy(3000);
      focusKeyRef.current += 1;
      setActiveDay(coords.day);
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

  // Auto-advance days during route playback (every 3 s).
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
    }, 3000);

    return () => window.clearInterval(timer);
  }, [isPlaying, sortedDayNumbers]);

  // Keep sidebar in sync while the map plays through days.
  useEffect(() => {
    if (!isPlaying) return;
    dayRefs.current.get(activeDay)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeDay, isPlaying]);

  useEffect(() => {
    if (plan?.days?.length) {
      setActiveDay(plan.days[0].day);
    }
  }, [plan]);

  // Track active day while scrolling — IntersectionObserver + scroll fallback.
  useEffect(() => {
    if (!plan) return;
    if (typeof window === "undefined") return;

    let observer: IntersectionObserver | null = null;
    let retryTimer = 0;
    let rafId = 0;

    const pickActiveDay = () => {
      if (isClickNavigatingRef.current || isPlayingRef.current) return;

      const els = Array.from(dayRefs.current.entries());
      if (els.length === 0) return;

      const lineY = window.innerHeight * 0.38;
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
          root: null,
          threshold: [0, 0.2, 0.4, 0.6, 0.8, 1],
          rootMargin: "-18% 0px -38% 0px",
        },
      );

      els.forEach((el) => observer!.observe(el));
      pickActiveDay();
      return true;
    };

    if (!attach()) {
      retryTimer = window.setTimeout(attach, 120);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
      if (clickNavTimerRef.current) clearTimeout(clickNavTimerRef.current);
      if (rafId) cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [plan, plan?.days.length]);

  if (loading && !plan) {
    return <AiPlanLoader />;
  }

  if (error) {
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
  const planUnlocked = isUnlocked || promoUnlocked;
  const shouldPaywallDays =
    !planUnlocked && (plan?.days.length ?? 0) > PAYWALL_FREE_DAYS;
  const displaySummary = plan ? withPlanTeaser(plan.summary, lang) : "";

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

      {onDownloadClick && (
        <div className="flex flex-col items-end gap-2 relative z-20">
          <button
            type="button"
            onClick={onDownloadClick}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:shadow-lg transition-shadow"
          >
            <span aria-hidden>⬇</span> {t("aiplan.downloadPdf" as never)}
          </button>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 max-w-sm text-right">
            {t("aiplan.pdfNotice" as never)}{" "}
            <a href="/#pricing" className="font-semibold underline hover:text-amber-900">
              {t("aiplan.viewPrices" as never)} →
            </a>
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-sky-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-sky-600 uppercase tracking-wider">
              <Sparkles className="h-4 w-4" /> {t("aiplan.badge" as never)}
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 leading-tight">
              {plan.destinationName}
            </h2>
            <PlannerChoicesSummary form={plannerForm} />
            {plan.weatherSummary ? (
              <WeatherSummaryCard summary={plan.weatherSummary} className="mt-3" />
            ) : null}
            <p className="mt-2 text-slate-600 max-w-2xl">{displaySummary}</p>
            <div className="mt-4">
              <TravelRequirements
                requirements={plan.travelRequirements}
                originIata={plan.originIata}
                destinationIata={plan.destinationIata}
                preview={!plan.travelRequirements?.visaInfo?.length}
              />
            </div>
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
              {formatMoney(plan.totalBudgetEur)}
            </div>
            <TripTotalBreakdown pax={pax} />
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_1.3fr] gap-4 sm:gap-5 lg:gap-6 lg:items-start w-full">
        <div className="space-y-4 sm:space-y-5 min-w-0 w-full order-1 lg:h-[calc(100vh-120px)] lg:overflow-y-auto lg:overscroll-contain">
          {plan.groundJourney && <TransportDashboard plan={plan} />}
          {plan.days.map((d, idx) => {
            const isLockedDay = shouldPaywallDays && idx >= PAYWALL_LOCKED_FROM_INDEX;
            const showUnlockOverlay = shouldPaywallDays && idx === PAYWALL_LOCKED_FROM_INDEX;
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
              <div key={d.day} className="relative">
                {showUnlockOverlay && (
                  <PaywallUnlockSection
                    onUnlockClick={onUnlockClick}
                    onPromoUnlock={() => setPromoUnlocked(true)}
                  />
                )}
                <div
                  className={cn(
                    isLockedDay && "blur-md pointer-events-none select-none",
                  )}
                >
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
                    onSelect={() => {
                      setActiveDay(d.day);
                      if (typeof window !== "undefined" && window.innerWidth < 1024) {
                        document.getElementById("ai-trip-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                    onActivityFocus={handleActivityFocus}
                    onActivityDetails={handleActivityDetails}
                    registerRef={(el) => {
                      if (el) dayRefs.current.set(d.day, el);
                      else dayRefs.current.delete(d.day);
                    }}
                  />
                </div>
              </div>
            );
          })}
          {pendingDayNumbers.map((dayNum, i) => {
            const isLockedPending = shouldPaywallDays && dayNum > PAYWALL_FREE_DAYS;
            const showUnlockOverlayPending =
              shouldPaywallDays && dayNum === PAYWALL_FREE_DAYS + 1 && plan.days.length <= PAYWALL_FREE_DAYS;
            return (
              <div key={`pending-${dayNum}`} className="relative">
                {showUnlockOverlayPending && (
                  <PaywallUnlockSection
                    onUnlockClick={onUnlockClick}
                    onPromoUnlock={() => setPromoUnlocked(true)}
                  />
                )}
                <div className={cn(isLockedPending && "blur-md pointer-events-none select-none")}>
                  <StreamingDayPlaceholder dayNumber={dayNum} isGenerating={i === 0} />
                </div>
              </div>
            );
          })}
          {!streaming && planUnlocked && <ReturnHomeCard plan={plan} />}
        </div>

        {hasCoords && (
          <AiTripMapPanel
            plan={plan}
            activeDay={activeDay}
            hasCoords={hasCoords}
            focusTarget={mapFocus}
            scrollSpyPaused={scrollSpyPaused || isPlaying}
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
