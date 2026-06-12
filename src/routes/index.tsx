import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { SearchPanel, type SearchValues } from "@/components/SearchPanel";
import { FlightResults } from "@/components/FlightResults";
import { SpotlightOverlay } from "@/components/SpotlightOverlay";
import { AiPlannerPreview, type AiPlannerContext, type AiPlannerSubmit } from "@/components/AiPlannerPreview";
import { FeatureGrid } from "@/components/FeatureGrid";
import { PricingSection } from "@/components/PricingSection";
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
import { FlightSearchHistory } from "@/components/FlightSearchHistory";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { resolveErrorMessage, useI18n } from "@/lib/i18n";
import { normalizePlanLangCode } from "@/lib/planLanguages";
import { normalizePlanCurrency } from "@/lib/planCurrency";
import { flightContextFromLegs } from "@/lib/flightScheduling";
import { isClassicRoundTrip } from "@/lib/flightSearch";
import { formatPlannerInterests } from "@/lib/plannerInterests";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/GoogleIcon";
import { googleSignInHref } from "@/lib/auth.urls";
import { hasAuthSession } from "@/lib/supabaseAuthHeaders";

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
      { name: "description", content: "Find flights, plan your route and book accommodation. AI itineraries, interactive maps and a downloadable PDF plan from €3.90." },
      { property: "og:title", content: "Skybooplan — Plan your next trip with AI" },
      { property: "og:description", content: "Real-time flights, smart itineraries, beautiful maps. One plan, one price." },
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
  const [lastPlannerForm, setLastPlannerForm] = useState<AiPlannerSubmit | null>(null);
  const [aiGenStartedAt, setAiGenStartedAt] = useState<number | null>(null);
  const [genInterrupted, setGenInterrupted] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
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
  const subscription = useSubscription();
  const navigate = useNavigate();
  const [paywall, setPaywall] = useState<null | "login" | "register" | "pay" | "daily">(null);
  const { t, lang, currency: uiCurrency } = useI18n();
  const queryClient = useQueryClient();
  const searchFn = useServerFn(searchFlights);
  const planFn = useServerFn(generateAiPlan);
  const skeletonFn = useServerFn(generateAiPlanSkeleton);
  const streamItinerary = useStreamItinerary();

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
      if (s.aiError) setAiError(s.aiError);
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
        setHistoryRefresh((n) => n + 1);
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

  function handleRepeat(v: SearchValues) {
    setPrefill(v);
    handleSearch(v);
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
      ai_model: "google:gemini-flash-latest",
      is_paid: subscription.isActive,
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
  ) {
    const rawCtx = ctxOverride ?? aiContext;
    if (!isActiveAiContext(rawCtx)) {
      setAiError(t("error.invalidSearchContext"));
      return;
    }

    if (!(await hasAuthSession())) {
      setPaywall("login");
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
      document.getElementById("ai-plan-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

      if (res.error) setAiError(res.error);
      setAiSkeleton(res.skeleton);
      setSavedPlanId(null);
    } catch (e) {
      console.error(e);
      setAiError(t("error.planGenerationFailed"));
    } finally {
      setAiLoading(false);
      setAiGenStartedAt(null);
    }
  }

  async function handleExpandFullPlan() {
    const form = normalizeLastPlannerForm(lastPlannerForm);
    if (!isActiveAiContext(aiContext) || !form || !aiSkeleton) return;

    if (!(await hasAuthSession())) {
      setPaywall("login");
      return;
    }

    const ctx = aiContext;
    setAiExpandingFull(true);
    setAiError(null);
    try {
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

      if (res.error) {
        setAiError(res.error);
        return;
      }

      if (res.plan) {
        setAiPlan({
          ...res.plan,
          accommodationMode: res.plan.accommodationMode ?? aiSkeleton.accommodationMode,
          hotelRestEveryNDays:
            res.plan.hotelRestEveryNDays ?? aiSkeleton.hotelRestEveryNDays,
        });
        setAiSkeleton(null);
        setSavedPlanId(null);
        await persistPlanToTrips(res.plan, ctx);
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
    <div className="min-h-screen flex flex-col w-full max-w-full overflow-x-hidden" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 pt-16 sm:pt-24 pb-12 text-center">
          <h1 className="overflow-visible bg-gradient-to-r from-slate-950 via-blue-900 to-indigo-800 bg-clip-text pb-2 text-4xl font-bold leading-tight tracking-tight text-transparent sm:text-6xl lg:text-7xl">
            {t("hero.title.a")} {t("hero.title.b")} {t("hero.title.c")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-500 sm:text-xl">
            {t("hero.subtitle")}
          </p>

          <div className="mt-12 max-w-6xl mx-auto text-left" id="flights">
            {(aiPlan || aiSkeleton || flights.length > 0 || lastSearch || isActiveAiContext(aiContext)) && (
              <div className="mb-4 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetLanding}
                >
                  🗑️ {t("search.clearNew")}
                </Button>
              </div>
            )}
            <SearchPanel
              onSearch={handleSearch}
              onValuesChange={handleSearchDraftChange}
              loading={loading || aiLoading}
              initialValues={prefill}
            />

            <FlightSearchHistory refreshKey={historyRefresh} onRepeat={handleRepeat} />

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

            {isActiveAiContext(aiContext) && !aiLoading && !displayPlan && !aiSkeleton && (
              <AiPlannerPreview
                context={aiContext}
                onGenerate={(f) => handleGeneratePlan(f, undefined, plannerMode)}
                loading={aiLoading || isGeminiStreaming}
              />
            )}

            <div id="ai-plan-anchor" />
            {(aiLoading || isGeminiStreaming || aiSkeleton || displayPlan || aiError || aiExpandingFull) && (
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
                  isUnlocked={subscription.isActive}
                  onUnlockClick={() => {
                    if (!user) {
                      setPaywall("register");
                      return;
                    }
                    setPaywall("pay");
                  }}
                  onDownloadClick={
                    aiPlan
                      ? async () => {
                    if (!user) {
                      setPaywall("register");
                      return;
                    }
                    if (!subscription.isActive) {
                      setPaywall("pay");
                      return;
                    }
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
                />
                ) : aiLoading && lastPlannerForm?.plannerStyle !== "catalog" ? (
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
          </div>
        </section>

        {/* Bottom planner removed — only the inline planner above renders to avoid form duplication. */}
        <FeatureGrid />
        <PricingSection />
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

      <Dialog open={paywall !== null} onOpenChange={(o) => !o && setPaywall(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {paywall === "login" && t("paywall.loginTitle")}
              {paywall === "register" && t("paywall.registerTitle")}
              {paywall === "pay" && t("paywall.payTitle")}
              {paywall === "daily" && t("paywall.dailyTitle")}
            </DialogTitle>
            <DialogDescription>
              {paywall === "login" && t("paywall.loginDesc")}
              {paywall === "register" && t("paywall.registerDesc")}
              {paywall === "pay" && t("paywall.payDesc")}
              {paywall === "daily" && t("paywall.dailyDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            {paywall === "login" ? (
              <>
                <Button variant="outline" onClick={() => setPaywall(null)}>{t("common.cancel")}</Button>
                <Button
                  onClick={() => {
                    setPaywall(null);
                    window.location.href = googleSignInHref();
                  }}
                >
                  <GoogleIcon className="h-4 w-4 mr-2" />
                  {t("nav.signInGoogle")}
                </Button>
              </>
            ) : paywall === "register" ? (
              <>
                <Button variant="outline" onClick={() => setPaywall(null)}>{t("common.cancel")}</Button>
                <Button onClick={() => { setPaywall(null); navigate({ to: "/signup" }); }}>{t("common.signUp")}</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setPaywall(null)}>{t("common.ok")}</Button>
                <Button onClick={() => { setPaywall(null); document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }); }}>{t("aiplan.viewPrices" as never)}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    );
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return <FatalErrorScreen error={error} />;
  }
}
