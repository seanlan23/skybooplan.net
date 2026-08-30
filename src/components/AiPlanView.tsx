import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { type ActivityMapFocus } from "@/components/TripMap";
import { AiTripMapPanel } from "@/components/AiTripMapPanel";
import { MobileMapOpenButton } from "@/components/MobileMapOverlay";
import { AiPlanDayCard, StreamingDayPlaceholder, activityFocusKey } from "@/components/AiPlanDayCard";
import { PackageDeck, PackagePlanDetails } from "@/components/PackageCard";
import { SingleBaseStayView } from "@/components/SingleBaseStayView";
import { resortPackagesFromPlan } from "@/lib/resortPackage";
import { isSingleBasePlan } from "@/lib/tripStyle";
import { POIDetailsModal } from "@/components/POIDetailsModal";
import { refreshPoiDetailsImage, type PoiDetailsData } from "@/lib/poiDetails.types";
import { DayScrollDebug } from "@/components/DayScrollDebug";
import { AiPlanLoader } from "@/components/AiPlanLoader";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isSoftQuotaError, resolveErrorMessage, useI18n } from "@/lib/i18n";
import { streamNeedsForegroundGuard } from "@/lib/streamAbort";
import { cn } from "@/lib/utils";
import { resolvePlanContentLanguage, stripPlanTeaser } from "@/lib/planTeaser";
import { getSeasonalHints } from "@/lib/seasonalHints";
import { buildTripCostSummary, summarizeAiTripCosts } from "@/lib/tripCostSummary";
import { buildWeatherWidgetFallback } from "@/lib/weatherWidgetFallback";
import { useDestinationContext } from "@/hooks/useDestinationContext";
import { DestinationInsightBanner } from "@/components/DestinationInsightBanner";
import type { TripFlightContext } from "@/lib/flightScheduling";
import { hotelStayDatesFromContext } from "@/lib/hotelStayDates";
import {
  buildTransitGuide,
  connectionsFromFlightContext,
} from "@/lib/flightTransitGuide";
import { TransitGuideNote } from "@/components/TransitGuideNote";
import { GoldenRulesNote } from "@/components/GoldenRulesNote";
import { parsePlannerInterestKeys } from "@/lib/plannerInterests";

import { parseLocalDate } from "@/lib/dateUtils";
import { haversineKm } from "@/lib/geoMath";
import {
  cameraMoveDurationMs,
  resolveCityCenter,
} from "@/lib/itineraryMapModel";
import { enrichMotorhomePlanTips } from "@/lib/motorhomePlanTips";

/** Hold at each stop during "Predvajaj pot" after the camera settles. */
const PLAY_ROUTE_HOLD_MS = 3200;

function playStepMs(plan: AiTripPlan, fromDay: number, toDay: number): number {
  const a = plan.days.find((d) => d.day === fromDay);
  const b = plan.days.find((d) => d.day === toDay);
  const ca = a ? resolveCityCenter(a) : null;
  const cb = b ? resolveCityCenter(b) : null;
  const dist =
    ca && cb ? haversineKm([ca.lng, ca.lat], [cb.lng, cb.lat]) : 0;
  return PLAY_ROUTE_HOLD_MS + cameraMoveDurationMs(dist);
}
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
  collectMotorhomeMapStops,
  collectMotorhomeRoadTripStops,
} from "@/lib/motorhomeRoute";
import {
  countMotorhomeStopsWithCoords,
  downloadMotorhomeStopsKml,
} from "@/lib/motorhomeMapExport";
import {
  buildAppleMapsRoadTripUrl,
  buildGoogleMapsRoadTripUrl,
} from "@/lib/navigationService";

export type { StayInfo };

function roadTripMapStops(plan: AiTripPlan): string[] {
  // Car + motorhome share the same geocode-safe stop builder (Berat → "Berat, Albania").
  // Bare city names sent car-only used to geocode to random DE businesses (~5800 km).
  return collectMotorhomeRoadTripStops(plan);
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
  onEmailClick,
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
  flightTotalEur,
  flightBookingUrl,
  loaderOrbit,
}: {
  loading: boolean;
  plan: AiTripPlan | null;
  error: string | null;
  stayInfo?: StayInfo;
  protect?: boolean;
  onDownloadClick?: () => void;
  onEmailClick?: () => void;
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
  /** Selected flight party total (EUR) — added into main TOTAL. */
  flightTotalEur?: number | null;
  /** Duffel / partner checkout when the selected offer has a booking URL. */
  flightBookingUrl?: string;
  /** Orbit vehicle while waiting for first day (motorhome = RV + exhaust). */
  loaderOrbit?: "flight" | "motorhome" | "car";
}) {
  const { t, lang, formatMoney } = useI18n();
  const [, setMotorhomeTipsTick] = useState(0);
  // Patch motorhome AI slips (Titova jama, wrong camps) + Ferragosto tips on loaded plans.
  useEffect(() => {
    if (!plan) return;
    if (plan.groundTransportMode !== "motorhome" && plan.accommodationMode !== "motorhome") {
      return;
    }
    enrichMotorhomePlanTips(plan, lang);
    setMotorhomeTipsTick((n) => n + 1);
  }, [plan, lang]);
  const [activeDay, setActiveDay] = useState<number>(1);
  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const planScrollRef = useRef<HTMLDivElement>(null);
  const [highlightPoiName, setHighlightPoiName] = useState<string | null>(null);
  const [highlightPoiLat, setHighlightPoiLat] = useState<number | null>(null);
  const [highlightPoiLng, setHighlightPoiLng] = useState<number | null>(null);
  const [poiModal, setPoiModal] = useState<PoiDetailsData | null>(null);
  const [poiModalOpen, setPoiModalOpen] = useState(false);
  const [scrollSpyPaused, setScrollSpyPaused] = useState(false);
  const [focusedActivityKey, setFocusedActivityKey] = useState<string | null>(null);
  const focusedActivityDayRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const packageDetailsRef = useRef<HTMLDivElement>(null);
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
  const planRegionCities = useMemo(() => {
    const cities = (plan?.days ?? [])
      .map((d) => (d.city ?? "").trim())
      .filter(Boolean);
    return [...new Set(cities)];
  }, [plan?.days]);
  const { ctx: destCtx, loading: destLoading } = useDestinationContext(
    destinationIata ?? plan?.destinationIata,
    departDate ?? plan?.days[0]?.date,
    lang,
    {
      returnDate,
      priorities: plannerPriorities,
      wishes: plannerWishes,
      regionCities: planRegionCities.length > 0 ? planRegionCities : undefined,
    },
  );

  const weatherFallback = useMemo(
    () =>
      plan
        ? buildWeatherWidgetFallback({
            destinationIata: destinationIata ?? plan.destinationIata,
            destinationPlace: [plan.destinationPlace, plan.destinationName].filter(Boolean).join(" "),
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

  const costSummary = useMemo(() => {
    if (!plan?.days.length) {
      return buildTripCostSummary({
        planEur: 0,
        flightTotalEur: flightTotalEur ?? 0,
        dayCount: 0,
        pax: Math.max(1, pax),
        mode: "hotel",
      });
    }
    return summarizeAiTripCosts(plan, {
      pax: Math.max(1, pax),
      flightTotalEur: flightTotalEur ?? plan.flightTotalEur,
      destinationIata: destinationIata ?? plan.destinationIata,
      departDate,
      returnDate,
      flights: flights ?? plan.flightContext,
    });
  }, [plan, destinationIata, flightTotalEur, pax, departDate, returnDate, flights]);

  const displayTotalBudget = costSummary.grandTotalEur;

  const hotelStay = useMemo(
    () =>
      hotelStayDatesFromContext(flights ?? plan?.flightContext, {
        departDate,
        returnDate,
      }),
    [flights, plan?.flightContext, departDate, returnDate],
  );

  const resortPackages = useMemo(() => {
    if (!plan || !isSingleBasePlan(plan)) return [];
    return resortPackagesFromPlan(plan, {
      pax: Math.max(1, pax),
      adults: Math.max(1, stayInfo?.adults ?? pax),
      rooms: Math.max(1, stayInfo?.rooms ?? Math.ceil(Math.max(1, stayInfo?.adults ?? pax) / 2)),
      childrenAges: stayInfo?.childrenAges,
      flightTotalEur: flightTotalEur ?? plan.flightTotalEur ?? costSummary.flightEur,
      departDate,
      returnDate,
      flights: flights ?? plan.flightContext,
      originIata: plan.originIata,
      destinationIata: destinationIata ?? plan.destinationIata,
      lang,
      flightBookingUrl,
    });
  }, [
    plan,
    pax,
    flightTotalEur,
    costSummary.flightEur,
    departDate,
    returnDate,
    flights,
    destinationIata,
    lang,
    flightBookingUrl,
    stayInfo?.adults,
    stayInfo?.rooms,
    stayInfo?.childrenAges,
  ]);
  const selectedPackage = resortPackages.find((pkg) => pkg.id === selectedPackageId);

  useEffect(() => {
    setSelectedPackageId(null);
  }, [plan?.destinationName, plan?.originIata, plan?.destinationIata, departDate, returnDate]);

  useEffect(() => {
    if (!selectedPackageId || !packageDetailsRef.current) return;
    packageDetailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedPackageId]);

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

  const clearPoiHighlight = useCallback(() => {
    focusedActivityDayRef.current = null;
    setFocusedActivityKey(null);
    setHighlightPoiName(null);
    setHighlightPoiLat(null);
    setHighlightPoiLng(null);
  }, []);

  const handleDaySelect = useCallback(
    (day: DayPlan) => {
      isClickNavigatingRef.current = true;
      setScrollSpyPaused(true);
      clearPoiHighlight();
      setActiveDay(day.day);
      scrollDayIntoView(day.day);
      if (clickNavTimerRef.current) clearTimeout(clickNavTimerRef.current);
      clickNavTimerRef.current = setTimeout(() => {
        isClickNavigatingRef.current = false;
        setScrollSpyPaused(false);
        clickNavTimerRef.current = null;
      }, 2600);
      if (typeof window !== "undefined" && !planUsesColumnScroll()) {
        setMobileMapOpen(true);
      }
    },
    [scrollDayIntoView, clearPoiHighlight],
  );

  const handleMapCitySelect = useCallback(
    (dayNum: number) => {
      const day = plan?.days.find((d) => d.day === dayNum);
      if (day) handleDaySelect(day);
    },
    [plan?.days, handleDaySelect],
  );

  const handleActivityFocus = useCallback(
    (coords: ActivityMapFocus, opts?: { openMobileMap?: boolean }) => {
      pauseScrollSpy(4000);
      setActiveDay(coords.day);
      // Highlight pin only — camera stays on day city center.
      focusedActivityDayRef.current = coords.day;
      setHighlightPoiName(coords.poiName ?? null);
      setHighlightPoiLat(
        Number.isFinite(coords.lat) && coords.lat !== 0 ? coords.lat : null,
      );
      setHighlightPoiLng(
        Number.isFinite(coords.lng) && coords.lng !== 0 ? coords.lng : null,
      );
      if (coords.poiName) {
        setFocusedActivityKey(activityFocusKey(coords.day, coords.poiName));
      }
      // Card tap may open the mobile map sheet; "More info" must NOT — it steals
      // the POI modal (sheet z-index sits above the dialog on phones).
      const openSheet = opts?.openMobileMap !== false;
      if (
        openSheet &&
        typeof window !== "undefined" &&
        window.innerWidth < 1024
      ) {
        setMobileMapOpen(true);
      }
    },
    [pauseScrollSpy],
  );

  const closeMobileMap = useCallback(() => {
    setMobileMapOpen(false);
    setIsPlaying(false);
    setScrollSpyPaused(false);
    isClickNavigatingRef.current = false;
  }, []);

  const handleActivityDetails = useCallback(
    (poi: PoiDetailsData) => {
      const day = plan?.days.find((d) => d.day === poi.day);
      const resolved = day ? refreshPoiDetailsImage(poi, day) : poi;
      // Close map sheet first so the details modal is tappable/visible on mobile.
      setMobileMapOpen(false);
      setIsPlaying(false);
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
        handleActivityFocus(
          {
            lat: poi.lat,
            lng: poi.lng,
            day: poi.day ?? day?.day ?? 1,
            poiName: poi.name,
          },
          { openMobileMap: false },
        );
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
      clearPoiHighlight();
      setScrollSpyPaused(true);
      isClickNavigatingRef.current = true;
      return true;
    });
  }, [sortedDayNumbers, clearPoiHighlight]);

  // Auto-advance during route playback — wait for long-haul flyTo before next day.
  useEffect(() => {
    if (!isPlaying || !plan || sortedDayNumbers.length < 2) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const advanceFrom = (current: number) => {
      const idx = sortedDayNumbers.indexOf(current);
      const nextIdx = idx < 0 ? 0 : idx + 1;
      if (nextIdx >= sortedDayNumbers.length) {
        setIsPlaying(false);
        setScrollSpyPaused(false);
        isClickNavigatingRef.current = false;
        return;
      }
      const next = sortedDayNumbers[nextIdx]!;
      const wait = playStepMs(plan, current, next);
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setActiveDay(next);
        advanceFrom(next);
      }, wait);
    };

    // Always start from day 1 (toggle resets activeDay); don't depend on activeDay ticks.
    advanceFrom(sortedDayNumbers[0]!);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [isPlaying, plan, sortedDayNumbers]);

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

  // Must stay above loading/error early returns — conditional useMemo crashes (Rules of Hooks).
  const roadTripStops = useMemo(
    () => (plan ? roadTripMapStops(plan) : []),
    [plan],
  );
  const motorhomeMapStops = useMemo(() => {
    if (!plan) return [];
    if (plan.groundTransportMode !== "motorhome" && plan.accommodationMode !== "motorhome") {
      return [];
    }
    return collectMotorhomeMapStops(plan, lang);
  }, [plan, lang]);
  const kmlStopCount = useMemo(() => {
    if (!plan) return 0;
    if (plan.groundTransportMode !== "motorhome" && plan.accommodationMode !== "motorhome") {
      return 0;
    }
    return countMotorhomeStopsWithCoords(plan, lang);
  }, [plan, lang]);

  // Keep sidebar in sync while the map plays through days.
  useEffect(() => {
    if (!isPlaying) return;
    scrollDayIntoView(activeDay);
  }, [activeDay, isPlaying, scrollDayIntoView]);

  useEffect(() => {
    if (!plan?.days?.length || !tripSessionKey) return;
    setActiveDay(plan.days[0].day);
    clearPoiHighlight();
  }, [tripSessionKey, clearPoiHighlight]);

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

    const applyScrollActiveDay = (day: number) => {
      setActiveDay((prev) => {
        if (prev === day) return prev;
        // Keep card↔pin highlight while the focused activity's day is still on screen.
        if (focusedActivityDayRef.current !== day) {
          focusedActivityDayRef.current = null;
          setFocusedActivityKey(null);
          setHighlightPoiName(null);
          setHighlightPoiLat(null);
          setHighlightPoiLng(null);
        }
        return day;
      });
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
          applyScrollActiveDay(day);
          return;
        }
        const center = (r.top + r.bottom) / 2;
        const score = Math.abs(center - lineY);
        if (score < bestScore) {
          bestScore = score;
          bestDay = day;
        }
      }
      if (bestDay != null) {
        applyScrollActiveDay(bestDay);
      }
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
          if (bestDay != null) {
            applyScrollActiveDay(bestDay);
          }
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
    return (
      <AiPlanLoader
        destination={destinationIata}
        orbit={loaderOrbit ?? "flight"}
      />
    );
  }

  if (error && !plan) {
    const soft = isSoftQuotaError(error);
    return (
      <div
        className={
          soft
            ? "mt-8 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950"
            : "mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700"
        }
      >
        {resolveErrorMessage(t, error)}
      </div>
    );
  }

  if (!plan) return null;

  const isResortMode = isSingleBasePlan(plan);
  const transitGuide = buildTransitGuide(
    connectionsFromFlightContext(flights ?? plan.flightContext),
    lang,
  );
  const totalExpectedDays = expectedDayCount > 0 ? expectedDayCount : plan.days.length;
  const pendingDayNumbers: number[] = [];
  if (streaming && !isResortMode && totalExpectedDays > plan.days.length) {
    const existing = new Set(plan.days.map((d) => d.day));
    for (let d = 1; d <= totalExpectedDays; d++) {
      if (!existing.has(d)) pendingDayNumbers.push(d);
    }
  }

  const mapHint = t("aiplan.mapHint" as never);
  const mapPlayLabel = t("aiplan.mapPlay" as never);
  const mapStopLabel = t("aiplan.mapStop" as never);
  const contentLanguage = resolvePlanContentLanguage(plan);
  const langMismatch = contentLanguage !== lang;
  const displaySummary = (() => {
    const stripped = stripPlanTeaser(plan.summary, lang);
    if (!langMismatch) return stripped;
    const depart = plan.days[0]?.date?.slice(0, 10);
    const last = plan.days[plan.days.length - 1];
    const ret = (last?.dateEnd ?? last?.date)?.slice(0, 10);
    const iata = plan.destinationIata?.trim();
    if (!depart || !iata) return "";
    const hints = getSeasonalHints(iata, depart, lang, { returnDate: ret });
    return hints[0]?.trim() || "";
  })();
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

      {(onDownloadClick || onEmailClick || onClearPlan) && (
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
            {onEmailClick && !streaming ? (
              <button
                type="button"
                onClick={onEmailClick}
                className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-800 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50"
              >
                {t("plan.emailCta" as never)}
              </button>
            ) : null}
            {onDownloadClick && !streaming ? (
              <button
                type="button"
                onClick={onDownloadClick}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-shadow hover:bg-sky-600 hover:shadow-lg"
              >
                <span aria-hidden>⬇</span> {t("aiplan.downloadPdf" as never)}
              </button>
            ) : null}
          </div>
          {onEmailClick && !streaming ? (
            <p className="text-xs text-slate-500 max-w-sm text-right">
              {t("plan.emailHint" as never)}
            </p>
          ) : onDownloadClick && !streaming ? (
            <p className="text-xs text-slate-500 max-w-sm text-right">
              {t("aiplan.pdfNotice" as never)}
            </p>
          ) : null}
        </div>
      )}

      {error &&
      !(isResortMode && /nepopoln\s*\(\d+\/\d+\s*dni\)/i.test(error)) ? (
        <div
          className={
            isSoftQuotaError(error)
              ? "rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"
              : "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          }
        >
          {resolveErrorMessage(t, error)}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-6 shadow-sm overflow-x-clip">
        <div className="flex min-w-0 flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {t("aiplan.badge" as never)}
            </p>
            <h2 className="mt-0.5 text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 leading-tight tracking-tight">
              {plan.destinationName}
            </h2>
            <ItineraryRouteOverview plan={plan} />
            {showRoadTripMaps ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <a
                    href={buildGoogleMapsRoadTripUrl(roadTripStops)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    {t("heroChat.motorhome.openGoogleMaps" as never)}
                  </a>
                  <a
                    href={buildAppleMapsRoadTripUrl(roadTripStops)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    {t("heroChat.motorhome.openAppleMaps" as never)}
                  </a>
                  {kmlStopCount > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => downloadMotorhomeStopsKml(plan, lang)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100"
                      >
                        {t("heroChat.motorhome.downloadStopsKml" as never)}
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
                            aria-label={t("heroChat.motorhome.kmlHelpAria" as never)}
                          >
                            <Info className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-72 max-w-[min(18rem,calc(100vw-2rem))] p-3 text-xs leading-relaxed text-slate-700"
                        >
                          <p className="font-semibold text-slate-900">
                            {t("heroChat.motorhome.kmlHelpAria" as never)}
                          </p>
                          <p className="mt-1.5">{t("heroChat.motorhome.kmlHelp" as never)}</p>
                        </PopoverContent>
                      </Popover>
                    </span>
                  ) : null}
                </div>
                {motorhomeMapStops.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {t("heroChat.motorhome.stopsTitle" as never)}
                    </p>
                    <ol className="mt-1.5 space-y-1 text-xs text-slate-700">
                      {motorhomeMapStops.map((stop, i) => (
                        <li key={`${stop.kind}-${stop.placeQuery}-${i}`} className="leading-snug">
                          <span className="font-semibold text-slate-900">{i + 1}.</span>{" "}
                          {stop.title}
                          {stop.kind === "overnight" ? (
                            <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                              {t("heroChat.motorhome.stopOvernight" as never)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      {t("heroChat.motorhome.stopsHint" as never)}
                    </p>
                  </div>
                ) : null}
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
              destinationIata={destinationIata ?? plan.destinationIata}
              destinationPlace={plan.destinationPlace ?? plan.destinationName}
              className="mt-3"
            />
            {!isResortMode ? (
            <div className="mt-4">
              <TravelRequirements
                requirements={plan.travelRequirements}
                originIata={plan.originIata}
                destinationIata={plan.destinationIata}
                destinationPlace={[
                  plan.destinationPlace,
                  plan.destinationName,
                  plan.summary,
                  ...(plan.days ?? []).map((d) => d.city),
                ]
                  .filter(Boolean)
                  .join(" ")}
                groundTransportMode={plan.groundTransportMode}
              />
              {transitGuide ? (
                <TransitGuideNote guide={transitGuide} className="mt-3" />
              ) : null}
              <GoldenRulesNote lang={lang} className="mt-3" />
            </div>
            ) : null}
            <PlannerChoicesSummary form={plannerForm} className="mt-4" />
            {langMismatch ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-3 text-sm text-amber-950">
                <p className="leading-relaxed">
                  {t("aiplan.langMismatch" as never).replace(
                    /\{lang\}/g,
                    t(`aiplan.langName.${contentLanguage}` as never),
                  )}
                </p>
                <button
                  type="button"
                  className="mt-2 inline-flex items-center rounded-full bg-amber-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-900"
                  onClick={() => {
                    document
                      .getElementById("ai-planner")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {t("aiplan.langMismatchCta" as never)}
                </button>
              </div>
            ) : null}
            {displaySummary ? (
              <p className="mt-2 text-slate-600 max-w-2xl text-sm leading-relaxed">{displaySummary}</p>
            ) : null}
            {streaming && !isResortMode && (
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
            {streaming ? (
              <p
                className={cn(
                  "mt-2 max-w-xl text-xs leading-relaxed text-amber-800/90",
                  !streamNeedsForegroundGuard() && "md:hidden",
                )}
              >
                {t("aiplan.keepScreenOn")}
              </p>
            ) : null}
          </div>
          <div className="w-full min-w-0 sm:w-60 sm:max-w-[15rem] sm:shrink-0 sm:text-right">
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
              car={plan.groundTransportMode === "car"}
              planEur={costSummary.planEur}
              flightEur={costSummary.flightEur}
              roundTrip={Boolean(flights?.inboundDepart)}
              overnight={costSummary.overnight}
            />
          </div>
        </div>
      </div>

      {isResortMode ? (
        <div className="space-y-5">
          {resortPackages.length ? (
            <>
              <PackageDeck
                packages={resortPackages}
                selectedId={selectedPackage?.id}
                onSelect={(id) =>
                  setSelectedPackageId((cur) => (cur === id ? null : id))
                }
                flightStay={hotelStay ?? undefined}
              />
              {selectedPackage && plan.resortStay ? (
                <div ref={packageDetailsRef} id="package-plan-details">
                  <PackagePlanDetails
                    stay={plan.resortStay}
                    pkg={selectedPackage}
                    onDownloadPdf={onDownloadClick}
                    flights={flights ?? plan.flightContext}
                    flightStay={hotelStay ?? undefined}
                  />
                </div>
              ) : null}
            </>
          ) : plan.resortStay ? (
            <SingleBaseStayView
              stay={plan.resortStay}
              destination={{
                destinationIata: destinationIata ?? plan.destinationIata,
                destinationName: plan.destinationName,
                destinationPlace: plan.destinationPlace,
              }}
              flights={flights ?? plan.flightContext}
            />
          ) : null}
          <TravelRequirements
            requirements={plan.travelRequirements}
            originIata={plan.originIata}
            destinationIata={plan.destinationIata}
            destinationPlace={[
              plan.destinationPlace,
              plan.destinationName,
              plan.summary,
            ]
              .filter(Boolean)
              .join(" ")}
            groundTransportMode={plan.groundTransportMode}
          />
        </div>
      ) : null}

      <SupportCard isGenerating={isGenerating} />

      {isResortMode ? null : (
      <div className="flex flex-col lg:grid lg:grid-cols-[1fr_1.3fr] gap-4 sm:gap-5 lg:gap-6 lg:items-start w-full">
        <div
          ref={planScrollRef}
          className="space-y-4 sm:space-y-5 min-w-0 w-full order-1 lg:h-[calc(100vh-120px)] lg:overflow-y-auto lg:overscroll-contain"
        >
          {plan.groundJourney && (
            <TransportDashboard
              plan={plan}
              activeDay={activeDay}
              onStopSelect={handleMapCitySelect}
            />
          )}
          {isResortMode ? null : plan.days.map((d, idx) => {
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
                  groundTransportMode={plan.groundTransportMode}
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
          {!isResortMode &&
            pendingDayNumbers.map((dayNum, i) => (
            <div key={`pending-${dayNum}`}>
              <StreamingDayPlaceholder dayNumber={dayNum} isGenerating={i === 0} />
            </div>
          ))}
          {!streaming && !isResortMode && <ReturnHomeCard plan={plan} />}
        </div>

        {hasCoords && (
          <AiTripMapPanel
            plan={plan}
            activeDay={activeDay}
            hasCoords={hasCoords}
            highlightPoiName={highlightPoiName}
            highlightPoiLat={highlightPoiLat}
            highlightPoiLng={highlightPoiLng}
            onDaySelect={handleMapCitySelect}
            onOpenPoiDetails={handleActivityDetails}
            streaming={streaming}
            expectedDayCount={totalExpectedDays}
            mapHint={mapHint}
            isPlaying={isPlaying}
            onTogglePlayback={handleTogglePlayback}
            playLabel={mapPlayLabel}
            stopLabel={mapStopLabel}
            variant="sidebar"
          />
        )}
      </div>
      )}

      {hasCoords && mobileMapOpen && !isResortMode && (
        <AiTripMapPanel
          plan={plan}
          activeDay={activeDay}
          hasCoords={hasCoords}
          highlightPoiName={highlightPoiName}
          highlightPoiLat={highlightPoiLat}
          highlightPoiLng={highlightPoiLng}
          onDaySelect={handleMapCitySelect}
          onOpenPoiDetails={handleActivityDetails}
          streaming={streaming}
          expectedDayCount={totalExpectedDays}
          mapHint={mapHint}
          isPlaying={isPlaying}
          onTogglePlayback={handleTogglePlayback}
          playLabel={mapPlayLabel}
          stopLabel={mapStopLabel}
          variant="sheet"
          onCloseSheet={closeMobileMap}
        />
      )}

      <MobileMapOpenButton
        visible={hasCoords && !mobileMapOpen && !isResortMode}
        onClick={() => setMobileMapOpen(true)}
      />

      <POIDetailsModal
        open={poiModalOpen}
        onOpenChange={setPoiModalOpen}
        poi={poiModal}
      />
    </div>
  );
}
