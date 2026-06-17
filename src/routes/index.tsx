import { createFileRoute, Link } from "@tanstack/react-router";
import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  HOME_RESET_EVENT,
  loadSession,
  saveSession,
  clearSession,
  consumeHomeReset,
  purgeLegacySessionCache,
} from "@/lib/sessionStore";
import { SiteHeader } from "@/components/SiteHeader";
import { HeroSection } from "@/components/HeroSection";
import { HeroFlightResults } from "@/components/HeroFlightResults";
import { HeroAiPlanResults } from "@/components/HeroAiPlanResults";
import { SocialProofSection } from "@/components/SocialProofSection";
import { TripInspiration } from "@/components/TripInspiration";
import { TestimonialsSection } from "@/components/TestimonialsSection";
import { FAQSection } from "@/components/FAQSection";
import type { SearchValues } from "@/components/SearchPanel";
import { FlightResults } from "@/components/FlightResults";
import { SpotlightOverlay } from "@/components/SpotlightOverlay";
import { AiPlannerPreview, type AiPlannerContext, type AiPlannerSubmit } from "@/components/AiPlannerPreview";
import { FeatureGrid } from "@/components/FeatureGrid";
import { SiteFooter } from "@/components/SiteFooter";
import { searchFlights, type DuffelFlight } from "@/lib/flights.functions";
import { airportConfusionHint } from "@/lib/airportRank";
import {
  generateAiPlan,
  generateAiPlanSkeleton,
  type AiTripPlan,
  type TripSkeleton,
} from "@/lib/aiPlan.functions";
import { useStreamItinerary } from "@/hooks/useStreamItinerary";
import { usePlanPhotoEnrichment } from "@/hooks/usePlanPhotoEnrichment";
import type { GenerateGeminiProTripInput } from "@/lib/geminiPro.functions";
import {
  normalizeIata,
  normalizeTripPlanPax,
  TRIP_WISH_TAGS,
} from "@/lib/geminiPro.shared";
import { AiPlanView } from "@/components/AiPlanView";
import { AiPlanLoader } from "@/components/AiPlanLoader";
import { AiPlanSkeletonView } from "@/components/AiPlanSkeletonView";
import { ConfirmModal } from "@/components/ConfirmModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { resolveErrorMessage, useI18n } from "@/lib/i18n";
import { normalizePlanLangCode } from "@/lib/planLanguages";
import { normalizePlanCurrency } from "@/lib/planCurrency";
import { flightContextFromLegs } from "@/lib/flightScheduling";
import { isClassicRoundTrip } from "@/lib/flightSearch";
import { formatPlannerInterests } from "@/lib/plannerInterests";
import { Button } from "@/components/ui/button";
import { addDays } from "@/lib/dateUtils";
import { parseMakeSearchFlights, type MakeSearchFlight } from "@/lib/makeSearch";
import { heroChatToPlannerPayload } from "@/lib/heroChatPlanner";
import type { HeroChatCollected } from "@/lib/heroChatFlow";
import { useUserLocation } from "@/lib/hooks/useUserLocation";

/** Full-screen fatal error — visible without devtools. */
function FatalErrorScreen({ error }: { error: Error }) {
  const { t } = useI18n();
  return (
    <div
      className="min-h-screen p-6 sm:p-10 bg-red-950 text-red-50"
      role="alert"
    >
      <h1 className="text-xl font-bold text-red-200 mb-4">{t("error.pageLoadTitle")}</h1>
      <pre className="text-sm whitespace-pre-wrap break-words font-mono leading-relaxed">
        {error.toString()} {t("error.pageLoadAtLine")} {error.stack ?? t("error.stackUnavailable")}
      </pre>
    </div>
  );
}

type LandingErrorBoundaryState = { error: Error | null };

class LandingErrorBoundary extends Component<
  { children: ReactNode },
  LandingErrorBoundaryState
> {
  state: LandingErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): LandingErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[LandingErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <FatalErrorScreen error={this.state.error} />;
    }
    return this.props.children;
  }
}

function LandingRoute() {
  return (
    <LandingErrorBoundary>
      <Landing />
    </LandingErrorBoundary>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Skybooplan — AI-powered travel planning, flights & stays" },
      { name: "description", content: "Find flights, plan your route and book accommodation. Free AI itineraries, interactive maps and PDF download — no paywall." },
      { property: "og:title", content: "Skybooplan — Plan your next trip with AI" },
      { property: "og:description", content: "Real-time flights, smart itineraries, beautiful maps. Free for everyone." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingRoute,
});

function plannerPaxFromSearch(v: SearchValues): { adults: number; childrenAges: number[] } {
  try {
    if (v.mode === "stays") {
      return normalizeTripPlanPax(
        { adults: v.stayAdults ?? Math.max(1, v.pax), childrenAges: v.childrenAges },
        v.pax,
      );
    }
    return normalizeTripPlanPax(
      {
        adults: v.adults,
        childrenAges: v.childrenAges ?? (v.children ? Array(v.children).fill(8) : []),
      },
      v.pax,
    );
  } catch {
    return { adults: 2, childrenAges: [] };
  }
}

const EMPTY_AI_CONTEXT: AiPlannerContext & { language?: string; currency?: "EUR" | "USD" } = {
  from: "",
  to: "",
  departDate: "",
  pax: 2,
  adults: 2,
  childrenAges: [],
  language: "sl",
  currency: "EUR",
};

function normalizeAiContext(
  input: Partial<AiPlannerContext & { language?: string }> | null | undefined,
): AiPlannerContext & { language?: string } {
  try {
    const base = { ...EMPTY_AI_CONTEXT };
    if (!input || typeof input !== "object") return base;

    const fromRaw = typeof input.from === "string" ? input.from : "";
    const toRaw = typeof input.to === "string" ? input.to : "";
    const departDate = typeof input.departDate === "string" ? input.departDate : "";
    const returnDate = typeof input.returnDate === "string" ? input.returnDate.trim() : "";

    const fallbackPax = typeof input.pax === "number" && input.pax > 0 ? input.pax : base.pax;
    const pax = normalizeTripPlanPax(
      { adults: input.adults, childrenAges: input.childrenAges },
      fallbackPax,
    );

    const from = normalizeIata(fromRaw) ?? fromRaw.trim().toUpperCase().slice(0, 3);
    const to = normalizeIata(toRaw) ?? toRaw.trim().toUpperCase().slice(0, 3);

    return {
      ...base,
      from,
      to,
      departDate,
      returnDate: returnDate || undefined,
      returnFromIata: normalizeIata(input.returnFromIata) ?? undefined,
      adults: pax.adults,
      childrenAges: pax.childrenAges ?? [],
      pax: pax.adults + (pax.childrenAges?.length ?? 0),
      language:
        typeof input.language === "string"
          ? normalizePlanLangCode(input.language)
          : base.language,
      currency:
        typeof input.currency === "string"
          ? normalizePlanCurrency(input.currency)
          : base.currency,
      flights: input.flights,
      originPlace: typeof input.originPlace === "string" ? input.originPlace.trim() : undefined,
      destinationPlace:
        typeof input.destinationPlace === "string" ? input.destinationPlace.trim() : undefined,
      groundTransportMode:
        input.groundTransportMode === "car" ||
        input.groundTransportMode === "motorhome" ||
        input.groundTransportMode === "train"
          ? input.groundTransportMode
          : undefined,
    };
  } catch (err) {
    console.warn("[normalizeAiContext] fallback:", err);
    return { ...EMPTY_AI_CONTEXT };
  }
}

function isActiveAiContext(
  ctx: Partial<AiPlannerContext & { language?: string }> | null | undefined,
): ctx is AiPlannerContext & { language?: string } {
  try {
    if (!ctx || typeof ctx !== "object") return false;
    return Boolean(
      ctx.departDate?.trim() &&
        ((ctx.originPlace?.trim() && ctx.destinationPlace?.trim()) ||
          (normalizeIata(ctx.from) && normalizeIata(ctx.to))),
    );
  } catch {
    return false;
  }
}

const WISH_TAG_SET = new Set<string>(TRIP_WISH_TAGS);

/** Legacy session blobs may omit tags/wishes/budget — normalize before render. */
function normalizeLastPlannerForm(input: unknown): AiPlannerSubmit | null {
  try {
    if (!input || typeof input !== "object") return null;
    const raw = input as Partial<AiPlannerSubmit>;
    const pace =
      raw.pace === "intensive" || raw.pace === "relaxed" || raw.pace === "calm"
        ? raw.pace
        : "relaxed";
    const budget =
      raw.budget === "budget" || raw.budget === "standard" || raw.budget === "premium"
        ? raw.budget
        : "standard";
    const tags = Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === "string" && t.length > 0)
      : [];
    const wishTags = Array.isArray(raw.wishTags)
      ? raw.wishTags.filter(
          (t): t is (typeof TRIP_WISH_TAGS)[number] =>
            typeof t === "string" && WISH_TAG_SET.has(t),
        )
      : [];
    const pickedAttractionIds = Array.isArray(raw.pickedAttractionIds)
      ? raw.pickedAttractionIds.filter((id): id is string => typeof id === "string")
      : undefined;
    const plannerStyle =
      raw.plannerStyle === "catalog" || raw.plannerStyle === "ai"
        ? raw.plannerStyle
        : undefined;

    return {
      pace,
      wishes: typeof raw.wishes === "string" ? raw.wishes : "",
      tags,
      customPrompt: typeof raw.customPrompt === "string" ? raw.customPrompt : "",
      budget,
      wishTags,
      pickedAttractionIds:
        pickedAttractionIds && pickedAttractionIds.length > 0
          ? pickedAttractionIds
          : undefined,
      plannerStyle,
    };
  } catch (err) {
    console.warn("[normalizeLastPlannerForm] fallback:", err);
    return null;
  }
}

function Landing() {
  const [fatalError, setFatalError] = useState<Error | null>(null);
  const [flights, setFlights] = useState<DuffelFlight[]>([]);
  const [selected, setSelected] = useState<DuffelFlight | null>(null);
  const [confirmFlight, setConfirmFlight] = useState<DuffelFlight | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchValues | null>(null);
  const [flightSearchDone, setFlightSearchDone] = useState(false);
  const [aiPlan, setAiPlan] = useState<AiTripPlan | null>(null);
  const [aiSkeleton, setAiSkeleton] = useState<TripSkeleton | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExpandingFull, setAiExpandingFull] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [heroDreamPrompt, setHeroDreamPrompt] = useState("");
  const [heroChatSeed, setHeroChatSeed] = useState<string | null>(null);
  const [heroFlights, setHeroFlights] = useState<MakeSearchFlight[]>([]);
  const [heroSearchLoading, setHeroSearchLoading] = useState(false);
  const [heroSearchError, setHeroSearchError] = useState<string | null>(null);
  const [heroSearchAttempted, setHeroSearchAttempted] = useState(false);
  const [heroPlannerActive, setHeroPlannerActive] = useState(false);
  const [lastPlannerForm, setLastPlannerForm] = useState<AiPlannerSubmit | null>(null);
  const [aiGenStartedAt, setAiGenStartedAt] = useState<number | null>(null);
  const [genInterrupted, setGenInterrupted] = useState(false);
  const [prefill, setPrefill] = useState<SearchValues | null>(null);
  const [searchDraft, setSearchDraft] = useState<SearchValues | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [aiContext, setAiContextState] = useState<AiPlannerContext & { language?: string }>(
    () => ({ ...EMPTY_AI_CONTEXT }),
  );

  function setAiContext(
    ctx: Partial<AiPlannerContext & { language?: string }> | null | undefined,
  ) {
    setAiContextState(normalizeAiContext(ctx));
  }
  const [plannerMode, setPlannerMode] = useState<"trip" | "stays">("trip");
  const { user } = useAuth();
  const { t, lang, currency: uiCurrency } = useI18n();
  const queryClient = useQueryClient();
  const searchFn = useServerFn(searchFlights);
  const planFn = useServerFn(generateAiPlan);
  const skeletonFn = useServerFn(generateAiPlanSkeleton);
  const streamItinerary = useStreamItinerary();
  const { location: userLocation } = useUserLocation();

  usePlanPhotoEnrichment(aiPlan, setAiPlan);

  const resetLanding = useCallback(() => {
    clearSession();
    queryClient.clear();
    setFlights([]);
    setSelected(null);
    setConfirmFlight(null);
    setAiPlan(null);
    setAiSkeleton(null);
    setAiError(null);
    setAiContext(null);
    setLastPlannerForm(null);
    setAiGenStartedAt(null);
    setGenInterrupted(false);
    setLastSearch(null);
    setFlightSearchDone(false);
    setPrefill(null);
    setSearchDraft(null);
    setSavedPlanId(null);
    setError(null);
    setShowSpotlight(false);
    setHeroDreamPrompt("");
    setHeroChatSeed(null);
    setHeroPlannerActive(false);
    setHeroSearchAttempted(false);
    setHeroFlights([]);
    setHeroSearchError(null);
    streamItinerary.reset();
  }, [queryClient, streamItinerary]);

  const handleSearchDraftChange = useCallback((v: SearchValues) => {
    setSearchDraft(v);
  }, []);

  const resetLandingRef = useRef(resetLanding);
  resetLandingRef.current = resetLanding;

  // Ujemi napake v useEffect / event handlerjih (Error Boundary jih ne vidi).
  useEffect(() => {
    const toError = (value: unknown): Error =>
      value instanceof Error ? value : new Error(String(value));

    const onWindowError = (event: ErrorEvent) => {
      setFatalError(
        toError(
          event.error ??
            `${event.message} (${event.filename}:${event.lineno}:${event.colno})`,
        ),
      );
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      setFatalError(toError(event.reason));
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  // Logo “home” on the same page — wipe session without a full navigation.
  useEffect(() => {
    const onHomeReset = () => resetLanding();
    window.addEventListener(HOME_RESET_EVENT, onHomeReset);
    return () => window.removeEventListener(HOME_RESET_EVENT, onHomeReset);
  }, [resetLanding]);

  // Hydrate search draft + AI plan from localStorage (survives tab refresh).
  // Flight result lists are not restored — they can be stale after API changes.
  useEffect(() => {
    try {
      if (consumeHomeReset()) {
        resetLandingRef.current();
        setSessionReady(true);
        return;
      }
      purgeLegacySessionCache();
      const s = loadSession();
      if (!s) {
        setSessionReady(true);
        return;
      }

      const draft = s.searchDraft ?? s.lastSearch;
      if (draft) {
        setPrefill(draft);
        setSearchDraft(draft);
      }
      if (s.lastSearch) setLastSearch(s.lastSearch);

      if (s.aiPlan) {
        setAiPlan(s.aiPlan);
        setTimeout(() => {
          document.getElementById("ai-plan-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
      }
      if (
        s.aiSkeleton &&
        Array.isArray(s.aiSkeleton.regions) &&
        s.aiSkeleton.regions.some((r) => (r?.highlights?.length ?? 0) > 0)
      ) {
        setAiSkeleton(s.aiSkeleton);
        if (!s.aiPlan) {
          setTimeout(() => {
            document.getElementById("ai-plan-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 300);
        }
      }
      if (s.aiError && (s.aiPlan || s.aiSkeleton)) setAiError(s.aiError);
      if (s.aiContext) {
        setAiContext(s.aiContext as Partial<AiPlannerContext & { language?: string }>);
      }
      if (s.lastPlannerForm) {
        setLastPlannerForm(normalizeLastPlannerForm(s.lastPlannerForm));
      }
      if (s.plannerMode) setPlannerMode(s.plannerMode);
      if (s.savedPlanId) setSavedPlanId(s.savedPlanId);
      if (
        s.aiGenStartedAt &&
        !s.aiSkeleton &&
        !s.aiPlan &&
        Date.now() - s.aiGenStartedAt < 5 * 60 * 1000
      ) {
        setGenInterrupted(true);
      }
    } catch (err) {
      console.warn("[session] hydrate failed:", err);
      setAiContextState({ ...EMPTY_AI_CONTEXT });
    } finally {
      setSessionReady(true);
    }
  }, []);

  // Persist after hydration so a refresh never overwrites stored data with empty state.
  useEffect(() => {
    if (!sessionReady) return;
    saveSession({
      searchDraft,
      lastSearch,
      aiPlan,
      aiSkeleton,
      aiError,
      aiContext: isActiveAiContext(aiContext) ? aiContext : null,
      lastPlannerForm,
      aiGenStartedAt,
      plannerMode,
      selected: null,
      flights: [],
      savedPlanId,
    });
  }, [
    sessionReady,
    searchDraft,
    lastSearch,
    aiPlan,
    aiSkeleton,
    aiError,
    aiContext,
    lastPlannerForm,
    aiGenStartedAt,
    plannerMode,
    savedPlanId,
  ]);

  function beginNewSearch() {
    setAiPlan(null);
    setAiSkeleton(null);
    setAiError(null);
    setLastPlannerForm(null);
    setAiGenStartedAt(null);
    setGenInterrupted(false);
    setSavedPlanId(null);
    streamItinerary.reset();
  }

  function handleInspirationSelect(destination: string) {
    setHeroChatSeed(destination);
    window.setTimeout(() => {
      document.getElementById("hero-chat-window")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  async function handleHeroDreamSubmit(prompt: string, collected: HeroChatCollected) {
    const trimmed = prompt.trim();
    if (!trimmed || heroSearchLoading) return;

    setHeroSearchAttempted(true);
    setHeroPlannerActive(true);
    setHeroSearchLoading(true);
    setHeroSearchError(null);
    setHeroFlights([]);
    setError(null);
    beginNewSearch();
    setHeroDreamPrompt(trimmed);

    let flightSearchOk = false;

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          attachment: collected.attachment ?? undefined,
          ...(userLocation
            ? {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
              }
            : {}),
        }),
      });

      const rawText = await res.text();
      let data: unknown = null;
      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText) as unknown;
        } catch {
          setHeroSearchError("heroSearch.error");
        }
      }

      if (!res.ok) {
        const record =
          data != null && typeof data === "object" && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : null;
        const message =
          record && typeof record.error === "string"
            ? record.error
            : "heroSearch.error";
        setHeroSearchError(message);
      } else {
        const parsed = parseMakeSearchFlights(data);
        setHeroFlights(parsed);
        flightSearchOk = true;
        if (parsed.length === 0) {
          setHeroSearchError("heroSearch.empty");
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.trim().toLowerCase() : "";
      const network =
        msg === "load failed" ||
        msg === "failed to fetch" ||
        msg.includes("networkerror") ||
        msg.includes("fetch failed");
      setHeroSearchError(network ? "error.networkFetch" : "heroSearch.error");
    } finally {
      setHeroSearchLoading(false);
    }

    const { ctx, form } = heroChatToPlannerPayload(collected, lang);
    setAiContext(ctx);
    setPlannerMode("trip");
    setLastSearch({
      mode: "ai",
      from: ctx.from,
      to: ctx.to,
      originPlace: ctx.originPlace,
      destinationPlace: ctx.destinationPlace,
      departDate: ctx.departDate,
      returnDate: ctx.returnDate ?? "",
      tripType: "return",
      pax: ctx.pax,
      adults: ctx.adults,
      children: ctx.childrenAges.length,
      childrenAges: ctx.childrenAges,
      language: lang,
    });

    void handleGeneratePlan(form, ctx, "trip", "hero-ai-plan-anchor", collected.attachment);

    if (flightSearchOk) {
      window.setTimeout(() => {
        document.getElementById("hero-flight-results")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 120);
    }
  }

  async function handleSearch(v: SearchValues) {
    setError(null);

    // STAYS: generate an AI stays-only tour of the destination (city or country)
    if (v.mode === "stays") {
      const dest = (v.destination ?? "").trim();
      if (!dest) {
        setError("error.destinationRequired");
        return;
      }
      if (!v.departDate) {
        setError("error.checkinRequired");
        return;
      }
      setFlights([]);
      setSelected(null);
      setShowSpotlight(false);
      beginNewSearch();
      setLastSearch({ ...v });
      const { adults, childrenAges } = plannerPaxFromSearch(v);
      const ctx = {
        from: dest,
        to: dest,
        departDate: v.departDate,
        returnDate: v.returnDate || undefined,
        pax: adults + childrenAges.length,
        adults,
        childrenAges,
        language: v.language || "sl",
      };
      setAiContext(ctx);
      setPlannerMode("stays");
      setTimeout(() => {
        document.getElementById("ai-planner")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return;
    }



    // AI PLANNER: do NOT auto-generate. Capture context, scroll to planner form,
    // user fills tempo + wishes there and submits.
    if (v.mode === "ai") {
      const origin = (v.originPlace ?? v.from).trim();
      const dest = (v.destinationPlace ?? v.to).trim();
      if (origin.length < 2) {
        setError("error.originRequired" as never);
        return;
      }
      if (dest.length < 2) {
        setError("error.destinationRequired");
        return;
      }
      if (!v.departDate) {
        setError("error.departRequired");
        return;
      }
      setFlights([]);
      setSelected(null);
      setShowSpotlight(false);
      beginNewSearch();
      setLastSearch({ ...v, from: origin, to: dest });
      const { adults, childrenAges } = plannerPaxFromSearch(v);
      setAiContext({
        from: normalizeIata(origin) ?? origin.slice(0, 3).toUpperCase(),
        to: normalizeIata(dest) ?? dest.slice(0, 3).toUpperCase(),
        originPlace: origin,
        destinationPlace: dest,
        groundTransportMode: v.groundTransportMode ?? "car",
        departDate: v.departDate,
        returnDate: v.returnDate || undefined,
        pax: adults + childrenAges.length,
        adults,
        childrenAges,
        language: v.language || "sl",
      });
      setPlannerMode("trip");
      setTimeout(() => {
        document.getElementById("ai-planner")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return;
    }

    // FLIGHTS (default)
    const isMulticity = v.tripType === "multicity" && (v.slices?.length ?? 0) >= 2;
    const from = v.from.trim().toUpperCase();
    const to = v.to.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
      setError("error.iataInvalid");
      return;
    }
    if (!v.departDate) {
      setError("error.departRequired");
      return;
    }
    if (isMulticity) {
      const leg2 = v.slices![1]!;
      const leg2From = leg2.from.trim().toUpperCase();
      const leg2To = leg2.to.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(leg2From) || !/^[A-Z]{3}$/.test(leg2To)) {
        setError("error.iataInvalid");
        return;
      }
      if (!leg2.departDate || leg2.departDate < v.departDate) {
        setError("error.returnBeforeDepart");
        return;
      }
    } else {
      if (v.tripType === "return" && !v.returnDate?.trim()) {
        setError("error.returnRequired");
        return;
      }
      if (v.returnDate && v.returnDate <= v.departDate) {
        setError("error.returnBeforeDepart");
        return;
      }
    }
    setLoading(true);
    setFlights([]);
    setSelected(null);
    setShowSpotlight(false);
    beginNewSearch();
    const normalizedSlices = isMulticity
      ? v.slices!.map((s) => ({
          from: s.from.trim().toUpperCase(),
          to: s.to.trim().toUpperCase(),
          departDate: s.departDate,
        }))
      : undefined;
    const normalized: SearchValues = { ...v, from, to, slices: normalizedSlices };
    setLastSearch(normalized);
    try {
      const res = await searchFn({
        data: isMulticity
          ? {
              tripType: "multicity" as const,
              slices: normalizedSlices!,
              pax: v.pax,
              cabinClass:
                v.cabinClass === "premium"
                  ? "premium_economy"
                  : (v.cabinClass as "economy" | "business" | "first" | undefined),
            }
          : {
              from,
              to,
              departDate: v.departDate,
              returnDate: v.returnDate || undefined,
              tripType: v.tripType,
              pax: v.pax,
              cabinClass:
                v.cabinClass === "premium"
                  ? "premium_economy"
                  : (v.cabinClass as "economy" | "business" | "first" | undefined),
            },
      });
      if (res.error && res.flights.length === 0) setError(res.error);
      setFlights(res.flights);
      if (res.flights.length > 0) {
        setTimeout(() => setShowSpotlight(true), 400);
      }
      if (user) {
        await supabase.from("flight_searches").insert({
          user_id: user.id,
          origin: from,
          destination: to,
          depart_date: v.departDate,
          return_date: v.returnDate || null,
          pax: v.pax,
          results_count: res.flights.length,
        });
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      if (/Unauthorized|authorization/i.test(msg)) {
        setError("error.authRequired" as never);
      } else if (/FlightSearchSchema|validation/i.test(msg)) {
        setError("error.iataInvalid");
      } else {
        setError("error.flightsSearchFailed");
      }
    } finally {
      setLoading(false);
      setFlightSearchDone(true);
    }
  }

  function handleSelect(f: DuffelFlight) {
    setConfirmFlight(f);
    setShowConfirm(true);
    setShowSpotlight(false);
  }

  async function handleConfirm() {
    const f = confirmFlight;
    if (!f) return;
    setShowConfirm(false);
    setSelected(f);
    setAiPlan(null);
    setAiError(null);
    const openJaw =
      f.tripKind === "multicity" ||
      (f.inbound && !isClassicRoundTrip(f.outbound, f.inbound));
    const { adults, childrenAges } = lastSearch ? plannerPaxFromSearch(lastSearch) : { adults: 1, childrenAges: [] as number[] };
    setAiContext({
      from: f.outbound.from,
      to: f.outbound.to,
      departDate: f.outbound.date,
      returnDate: f.inbound?.date || lastSearch?.returnDate || undefined,
      returnFromIata: openJaw && f.inbound ? f.inbound.from : undefined,
      pax: adults + childrenAges.length,
      adults,
      childrenAges,
      language: lastSearch?.language || "sl",
      flights: flightContextFromLegs(f.outbound, f.inbound),
    });
    setTimeout(() => {
      document.getElementById("ai-planner")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function buildWishes(form: AiPlannerSubmit | null | undefined): string {
    try {
      const safe = form ? normalizeLastPlannerForm(form) : null;
      if (!safe) return "";
      const lang = aiContext?.language || lastSearch?.language || "sl";
      const tags = safe.tags ?? [];
      const interests =
        tags.length > 0 ? `Prioritete: ${formatPlannerInterests(tags, lang)}.` : "";
      const budget =
        safe.budget === "budget"
          ? "Proračun: nizki (Budget)."
          : safe.budget === "premium"
            ? "Proračun: Premium."
            : "Proračun: Standard.";
      const wishTags = safe.wishTags ?? [];
      const chips =
        wishTags.length > 0 ? `Posebne zahteve: ${wishTags.join(", ")}.` : "";
      const wishesText = typeof safe.wishes === "string" ? safe.wishes.trim() : "";
      return [wishesText, interests, budget, chips].filter(Boolean).join(" ");
    } catch (err) {
      console.warn("[buildWishes] fallback:", err);
      return "";
    }
  }

  async function persistPlanToTrips(plan: AiTripPlan, ctx: AiPlannerContext) {
    if (!user) return;
    const dest = plan.destinationName || ctx.to;
    const startDate = (ctx.departDate || "").slice(0, 10) || null;
    const endDate = ctx.returnDate ? ctx.returnDate.slice(0, 10) : null;
    const title = `${ctx.from} → ${ctx.to} · ${startDate ?? ctx.departDate}`;
    const basePayload = {
      user_id: user.id,
      title,
      destination: dest,
      start_date: startDate,
      end_date: endDate,
      itinerary: plan as never,
      ai_model: "google:gemini-2.5-flash",
      is_paid: false,
    };

    let query = supabase
      .from("travel_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("destination", dest);
    query = startDate ? query.eq("start_date", startDate) : query.is("start_date", null);
    query = endDate ? query.eq("end_date", endDate) : query.is("end_date", null);
    const { data: existing } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error: updErr } = await supabase.from("travel_plans").update(basePayload).eq("id", existing.id);
      if (updErr) console.error("Update plan failed:", updErr);
      else setSavedPlanId(existing.id);
    } else {
      const { data: saved, error: saveErr } = await supabase
        .from("travel_plans")
        .insert(basePayload)
        .select("id")
        .single();
      if (saveErr) console.error("Save plan failed:", saveErr);
      else if (saved) setSavedPlanId(saved.id);
    }
  }

  async function handleGeneratePlan(
    form: AiPlannerSubmit,
    ctxOverride?: AiPlannerContext & { language?: string },
    modeOverride?: "trip" | "stays",
    scrollAnchorId = "ai-plan-anchor",
    heroAttachment?: HeroChatCollected["attachment"],
  ) {
    const rawCtx = ctxOverride ?? aiContext;
    if (!isActiveAiContext(rawCtx)) {
      setAiError(t("error.invalidSearchContext"));
      return;
    }

    const ctx = normalizeAiContext(rawCtx);

    const safeForm = normalizeLastPlannerForm(form) ?? form;
    setLastPlannerForm(safeForm);
    setAiPlan(null);
    setAiSkeleton(null);
    setAiError(null);
    streamItinerary.reset();
    setGenInterrupted(false);
    setAiGenStartedAt(Date.now());
    setAiLoading(true);
    setTimeout(() => {
      document.getElementById(scrollAnchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    try {
      const lang = ctx.language || "sl";
      const planCurrency = normalizePlanCurrency(ctx.currency ?? lastSearch?.currency ?? uiCurrency);
      const tags = safeForm.tags ?? [];
      const priorities =
        tags.length > 0 ? [formatPlannerInterests(tags, lang)] : undefined;
      const pax = normalizeTripPlanPax(
        { adults: ctx.adults, childrenAges: ctx.childrenAges },
        ctx.pax,
      );

      if (safeForm.plannerStyle !== "catalog") {
        const clientStartedAt = performance.now();
        console.log("[GeminiPro] client: starting stream generation…", {
          from: ctx.from,
          to: ctx.to,
          departDate: ctx.departDate,
          returnDate: ctx.returnDate,
          pax,
        });

        const groundTrip =
          ctx.groundTransportMode &&
          ctx.originPlace?.trim() &&
          ctx.destinationPlace?.trim()
            ? {
                groundTransportMode: ctx.groundTransportMode,
                originPlace: ctx.originPlace.trim(),
                destinationPlace: ctx.destinationPlace.trim(),
              }
            : {};

        const streamInput: GenerateGeminiProTripInput = {
          originIata: ctx.from,
          destinationIata: ctx.to,
          returnFromIata: ctx.returnFromIata,
          departDate: ctx.departDate,
          returnDate: ctx.returnDate || undefined,
          pax,
          budget: safeForm.budget ?? "standard",
          wishTags: safeForm.wishTags ?? [],
          customWishes: buildWishes(safeForm) || safeForm.wishes?.trim() || undefined,
          pace: safeForm.pace,
          priorities,
          attachment: heroAttachment ?? undefined,
          ...groundTrip,
          language: ctx.language || lang,
          currency: planCurrency,
        };

        const { plan, error: streamError } = await streamItinerary.start(streamInput);
        setAiLoading(false);

        console.log(
          `[GeminiPro] client: stream finished in ${Math.round(performance.now() - clientStartedAt)}ms`,
          { days: plan?.days.length ?? 0, error: streamError },
        );

        if (streamError) {
          setAiError(streamError);
          return;
        }
        if (plan?.days?.length) {
          setAiPlan(plan);
          setSavedPlanId(null);
        } else {
          setAiError(t("error.planInvalidFormat"));
        }
        return;
      }

      const wishes = buildWishes(safeForm);
      const clientStartedAt = performance.now();
      console.log("[AiPlan] client: starting skeleton generation…", {
        from: ctx.from,
        to: ctx.to,
        departDate: ctx.departDate,
        returnDate: ctx.returnDate,
        mode: modeOverride ?? "trip",
      });
      const res = await skeletonFn({
        data: {
          destinationIata: ctx.to,
          originIata: ctx.from,
          returnFromIata: ctx.returnFromIata,
          departDate: ctx.departDate,
          returnDate: ctx.returnDate || undefined,
          pax: ctx.pax,
          language: ctx.language || "sl",
          currency: planCurrency,
          pace: safeForm.pace,
          wishes,
          priorities: safeForm.tags,
          customPrompt: safeForm.customPrompt,
          mode: modeOverride ?? "trip",
          flightContext: ctx.flights,
          pickedAttractionIds: safeForm.pickedAttractionIds,
        },
      });
      console.log(
        `[AiPlan] client: skeleton responded in ${Math.round(performance.now() - clientStartedAt)}ms`,
        { error: res.error, regions: res.skeleton?.regions.length ?? 0 },
      );
      if (res.debug?.length) {
        console.group("[AiPlan:Skeleton] server trace");
        res.debug.forEach((line) => console.log(`[AiPlan:Skeleton] ${line}`));
        console.groupEnd();
      }

      if (res.error) {
        setAiError(res.error);
        setSavedPlanId(null);
        return;
      }
      if (!res.skeleton) {
        setAiError(t("error.planInvalidFormat"));
        setSavedPlanId(null);
        return;
      }

      setAiLoading(false);
      setAiExpandingFull(true);
      try {
        const { plan: fullPlan, error: expandError } = await expandSkeletonToFullPlan(
          res.skeleton,
          safeForm,
          ctx,
        );
        if (expandError) {
          setAiError(expandError);
          setAiSkeleton(res.skeleton);
        } else if (fullPlan) {
          setAiPlan(fullPlan);
          setAiSkeleton(null);
          setSavedPlanId(null);
          await persistPlanToTrips(fullPlan, ctx);
        }
      } catch (e) {
        console.error(e);
        setAiError(t("error.planGenerationFailed"));
        setAiSkeleton(res.skeleton);
      } finally {
        setAiExpandingFull(false);
        setAiGenStartedAt(null);
      }
      return;
    } catch (e) {
      console.error(e);
      setAiError(t("error.planGenerationFailed"));
    } finally {
      setAiLoading(false);
      setAiGenStartedAt(null);
    }
  }

  async function expandSkeletonToFullPlan(
    skeleton: TripSkeleton,
    form: AiPlannerSubmit,
    ctx: ReturnType<typeof normalizeAiContext>,
  ): Promise<{ plan: AiTripPlan | null; error: string | null }> {
    const wishes = buildWishes(form);
    const clientStartedAt = performance.now();
    console.log("[AiPlan] client: expanding to full day-by-day plan…");
    const res = await planFn({
      data: {
        destinationIata: ctx.to,
        originIata: ctx.from,
        returnFromIata: ctx.returnFromIata,
        departDate: ctx.departDate,
        returnDate: ctx.returnDate || undefined,
        pax: ctx.pax,
        language: ctx.language || "sl",
        currency: normalizePlanCurrency(ctx.currency ?? lastSearch?.currency ?? uiCurrency),
        pace: form.pace,
        wishes,
        priorities: form.tags,
        customPrompt: form.customPrompt,
        mode: plannerMode,
        flightContext: ctx.flights,
      },
    });
    console.log(
      `[AiPlan] client: full plan in ${Math.round(performance.now() - clientStartedAt)}ms`,
      { error: res.error, days: res.plan?.days.length ?? 0 },
    );
    if (res.debug?.length) {
      console.group("[AiPlan] server trace");
      res.debug.forEach((line) => console.log(`[AiPlan] ${line}`));
      console.groupEnd();
    }

    if (res.error) return { plan: null, error: res.error };
    if (!res.plan) return { plan: null, error: t("error.planInvalidFormat") };

    return {
      plan: {
        ...res.plan,
        accommodationMode: res.plan.accommodationMode ?? skeleton.accommodationMode,
        hotelRestEveryNDays: res.plan.hotelRestEveryNDays ?? skeleton.hotelRestEveryNDays,
      },
      error: null,
    };
  }

  async function handleExpandFullPlan() {
    const form = normalizeLastPlannerForm(lastPlannerForm);
    if (!isActiveAiContext(aiContext) || !form || !aiSkeleton) return;

    const ctx = aiContext;
    setAiExpandingFull(true);
    setAiError(null);
    try {
      const { plan, error } = await expandSkeletonToFullPlan(aiSkeleton, form, ctx);
      if (error) {
        setAiError(error);
        return;
      }
      if (plan) {
        setAiPlan(plan);
        setAiSkeleton(null);
        setSavedPlanId(null);
        await persistPlanToTrips(plan, ctx);
      }
    } catch (e) {
      console.error(e);
      setAiError(t("error.planGenerationFailed"));
    } finally {
      setAiExpandingFull(false);
    }
  }

  if (fatalError) {
    return <FatalErrorScreen error={fatalError} />;
  }

  const streamPreviewPlan = streamItinerary.previewPlan;
  const displayPlan = aiPlan ?? streamPreviewPlan;
  const isGeminiStreaming = streamItinerary.isStreaming && !aiPlan;

  try {
    return (
    <div className="min-h-screen flex flex-col w-full max-w-full overflow-x-hidden bg-background">
      <div className="relative">
        <SiteHeader variant="hero" className="absolute inset-x-0 top-0 border-b-0 bg-transparent backdrop-blur-none" />
        <HeroSection
          onSearch={handleHeroDreamSubmit}
          loading={heroSearchLoading}
          seedDestination={heroChatSeed}
          onSeedConsumed={() => setHeroChatSeed(null)}
        />
      </div>

      <HeroFlightResults
        flights={heroFlights}
        loading={heroSearchLoading}
        error={heroSearchError}
        visible={heroSearchAttempted}
      />

      <HeroAiPlanResults
        visible={heroPlannerActive}
        aiLoading={aiLoading}
        aiExpandingFull={aiExpandingFull}
        isGeminiStreaming={isGeminiStreaming}
        displayPlan={displayPlan}
        aiSkeleton={aiSkeleton}
        aiError={aiError}
        aiContext={aiContext}
        aiPlan={aiPlan}
        lastPlannerForm={lastPlannerForm}
        aiGenStartedAt={aiGenStartedAt}
        streamExpectedDays={streamItinerary.expectedDays}
        savedPlanId={savedPlanId}
        user={user}
        buildWishes={buildWishes}
        normalizeLastPlannerForm={normalizeLastPlannerForm}
        onExpandFull={handleExpandFullPlan}
        lastSearchPax={{
          adults: lastSearch?.adults ?? aiContext?.adults,
          childrenAges: lastSearch?.childrenAges ?? aiContext?.childrenAges,
          rooms: lastSearch?.rooms,
        }}
      />

      <SocialProofSection />
      <TripInspiration onSelectDestination={handleInspirationSelect} />
      <TestimonialsSection />
      <FAQSection />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pb-12">

            {error && (
              <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {resolveErrorMessage(t, error)}
              </div>
            )}

            {flights.length > 0 && !selected && (
              <div className="transition-opacity duration-500">
                <FlightResults
                  flights={flights}
                  selectedId={null}
                  onSelect={handleSelect}
                  pax={lastSearch?.pax ?? 1}
                  searchMeta={
                    lastSearch
                      ? {
                          from: lastSearch.from,
                          to: lastSearch.to,
                          departDate: lastSearch.departDate,
                          returnDate: lastSearch.returnDate || undefined,
                        }
                      : null
                  }
                />

              </div>
            )}

            {!loading && !error && flightSearchDone && flights.length === 0 && lastSearch && lastSearch.mode === "flights" && (
              <div className="mt-6 rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground space-y-2">
                <p>{t("error.noFlights")}</p>
                {(() => {
                  const hint = airportConfusionHint(lastSearch.from, lastSearch.to);
                  return hint ? <p className="text-amber-700 font-medium">{t(hint)}</p> : null;
                })()}
              </div>
            )}

            {genInterrupted && !aiLoading && !aiPlan && !aiSkeleton && isActiveAiContext(aiContext) && lastPlannerForm && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
                <span>{t("skeleton.genInterrupted")}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGeneratePlan(lastPlannerForm)}
                >
                  {t("skeleton.retry")}
                </Button>
              </div>
            )}

            {isActiveAiContext(aiContext) && !heroPlannerActive && !aiLoading && !displayPlan && !aiSkeleton && (
              <AiPlannerPreview
                context={aiContext}
                initialWishes={heroDreamPrompt}
                onGenerate={(f) => handleGeneratePlan(f, undefined, plannerMode)}
                loading={aiLoading || isGeminiStreaming}
              />
            )}

            <div id="ai-plan-anchor" />
            {!heroPlannerActive &&
            (aiLoading || isGeminiStreaming || aiSkeleton || displayPlan || aiError || aiExpandingFull) && (
              <>
                {displayPlan ? (
                <AiPlanView
                  loading={false}
                  plan={displayPlan}
                  streaming={isGeminiStreaming}
                  expectedDayCount={streamItinerary.expectedDays}
                  error={null}
                  pax={aiContext?.pax ?? 1}
                  protect={false}
                  onDownloadClick={
                    aiPlan
                      ? async () => {
                          try {
                            const { generatePlanPdf } = await import("@/lib/pdf-export");
                            await generatePlanPdf({
                              title: `${aiContext?.from ?? ""} → ${aiContext?.to ?? ""}`,
                              destination: aiPlan?.destinationName ?? aiContext?.to ?? "",
                              start_date: aiContext?.departDate ?? null,
                              end_date: aiContext?.returnDate ?? null,
                              itinerary: aiPlan as never,
                            });
                          } catch (e) {
                            console.error("PDF export failed", e);
                            alert(t("trips.pdfError"));
                          }
                        }
                      : undefined
                  }
                  stayInfo={{
                    adults: lastSearch?.stayAdults ?? lastSearch?.pax ?? 2,
                    childrenAges: lastSearch?.childrenAges ?? [],
                    rooms: lastSearch?.rooms ?? 1,
                  }}
                  plannerWishes={
                    lastPlannerForm ? buildWishes(lastPlannerForm) || undefined : undefined
                  }
                  plannerForm={normalizeLastPlannerForm(lastPlannerForm)}
                  destinationIata={aiContext?.to}
                  departDate={aiContext?.departDate}
                  returnDate={aiContext?.returnDate}
                  flights={aiContext?.flights}
                />
                ) : aiLoading || aiExpandingFull ? (
                <AiPlanLoader
                  tripDays={
                    aiContext?.departDate && aiContext?.returnDate
                      ? Math.max(
                          1,
                          Math.round(
                            (new Date(`${aiContext.returnDate}T00:00:00Z`).getTime() -
                              new Date(`${aiContext.departDate}T00:00:00Z`).getTime()) /
                              86_400_000,
                          ) + 1,
                        )
                      : 7
                  }
                  startedAt={aiGenStartedAt}
                />
                ) : (
                <AiPlanSkeletonView
                  skeleton={aiSkeleton}
                  loading={aiLoading}
                  expanding={aiExpandingFull}
                  error={aiError}
                  pax={aiContext?.pax ?? 1}
                  tripDays={
                    aiContext?.departDate && aiContext?.returnDate
                      ? Math.max(
                          1,
                          Math.round(
                            (new Date(`${aiContext.returnDate}T00:00:00Z`).getTime() -
                              new Date(`${aiContext.departDate}T00:00:00Z`).getTime()) /
                              86_400_000,
                          ),
                        )
                      : 7
                  }
                  genStartedAt={aiGenStartedAt}
                  destinationIata={aiContext?.to}
                  departDate={aiContext?.departDate}
                  language={aiContext?.language}
                  flights={aiContext?.flights}
                  stayInfo={{
                    adults: lastSearch?.stayAdults ?? lastSearch?.pax ?? 2,
                    childrenAges: lastSearch?.childrenAges ?? [],
                    rooms: lastSearch?.rooms ?? 1,
                  }}
                  onExpandFull={handleExpandFullPlan}
                  plannerWishes={
                    lastPlannerForm ? buildWishes(lastPlannerForm) || undefined : undefined
                  }
                  plannerForm={normalizeLastPlannerForm(lastPlannerForm)}
                />
                )}
                {savedPlanId && (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-5 py-3 text-sm">
                    <span className="text-foreground font-medium">
                      {t("plan.saved")}
                    </span>
                    <Link
                      to="/my-trips/$planId"
                      params={{ planId: savedPlanId }}
                      className="font-semibold text-brand hover:underline"
                    >
                      {t("plan.openDashboard")}
                    </Link>
                  </div>
                )}
                {aiPlan && !savedPlanId && !user && (
                  <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">
                    {t("plan.loginToSave")}
                  </div>
                )}
              </>
            )}
        </section>

        {/* Bottom planner removed — only the inline planner above renders to avoid form duplication. */}
        <FeatureGrid />
      </main>

      <SiteFooter />

      {showSpotlight && (
        <SpotlightOverlay
          targetSelector="[data-select-ai-plan='first']"
          message={t("spotlight.selectFlight")}
          onDismiss={() => setShowSpotlight(false)}
        />
      )}

      <ConfirmModal
        flight={confirmFlight}
        open={showConfirm}
        searchDepartDate={lastSearch?.departDate}
        searchReturnDate={lastSearch?.returnDate}
        onConfirm={handleConfirm}
        onCancel={() => { setShowConfirm(false); setConfirmFlight(null); }}
      />
    </div>
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return <FatalErrorScreen error={error} />;
  }
}
