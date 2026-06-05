import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { loadSession, saveSession, clearSession } from "@/lib/sessionStore";
import { SiteHeader } from "@/components/SiteHeader";
import { SearchPanel, type SearchValues } from "@/components/SearchPanel";
import { FlightResults } from "@/components/FlightResults";
import { SpotlightOverlay } from "@/components/SpotlightOverlay";
import { AiPlannerPreview, type AiPlannerContext, type AiPlannerSubmit } from "@/components/AiPlannerPreview";
import { FeatureGrid } from "@/components/FeatureGrid";
import { PricingSection } from "@/components/PricingSection";
import { SiteFooter } from "@/components/SiteFooter";
import { searchFlights, type DuffelFlight } from "@/lib/flights.functions";
import { generateAiPlan, type AiTripPlan } from "@/lib/aiPlan.functions";
import { AiPlanView } from "@/components/AiPlanView";
import { ConfirmModal } from "@/components/ConfirmModal";
import { FlightSearchHistory } from "@/components/FlightSearchHistory";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { resolveErrorMessage, useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  component: Landing,
});

function Landing() {
  const [flights, setFlights] = useState<DuffelFlight[]>([]);
  const [selected, setSelected] = useState<DuffelFlight | null>(null);
  const [confirmFlight, setConfirmFlight] = useState<DuffelFlight | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSpotlight, setShowSpotlight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSearch, setLastSearch] = useState<SearchValues | null>(null);
  const [aiPlan, setAiPlan] = useState<AiTripPlan | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [prefill, setPrefill] = useState<SearchValues | null>(null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [aiContext, setAiContext] = useState<(AiPlannerContext & { language?: string }) | null>(null);
  const [plannerMode, setPlannerMode] = useState<"trip" | "stays">("trip");
  const { user } = useAuth();
  const subscription = useSubscription();
  const navigate = useNavigate();
  const [paywall, setPaywall] = useState<null | "register" | "pay" | "daily">(null);
  const { t } = useI18n();
  const searchFn = useServerFn(searchFlights);
  const planFn = useServerFn(generateAiPlan);

  // Hydrate only search context + AI state from localStorage.
  // Do not restore old flight results, because they can become stale and look
  // like live search data after API/config changes.
  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    // Do not prefill the search form on page open/refresh — user wants
    // an empty searcher every time. We still keep lastSearch in memory for
    // contextual rendering of prior results below.
    if (s.lastSearch) {
      setLastSearch(s.lastSearch);
    }
    if (s.aiPlan) setAiPlan(s.aiPlan);
    if (s.aiContext) setAiContext(s.aiContext);
    if (s.plannerMode) setPlannerMode(s.plannerMode);
    if (s.savedPlanId) setSavedPlanId(s.savedPlanId);
  }, []);

  // Persist on key state changes.
  useEffect(() => {
    saveSession({ lastSearch, aiPlan, aiContext, plannerMode, selected: null, flights: [], savedPlanId });
  }, [lastSearch, aiPlan, aiContext, plannerMode, savedPlanId]);

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
      setAiPlan(null);
      setAiError(null);
      setLastSearch({ ...v });
      const ctx = {
        from: dest,
        to: dest,
        departDate: v.departDate,
        returnDate: v.returnDate || undefined,
        pax: v.stayAdults ?? v.pax,
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
      setFlights([]);
      setSelected(null);
      setShowSpotlight(false);
      setAiPlan(null);
      setAiError(null);
      setLastSearch({ ...v, from, to });
      setAiContext({
        from,
        to,
        departDate: v.departDate,
        returnDate: v.returnDate || undefined,
        pax: v.pax,
        language: v.language || "sl",
      });
      setPlannerMode("trip");
      setTimeout(() => {
        document.getElementById("ai-planner")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return;
    }

    // FLIGHTS (default)
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
    if (v.returnDate && v.returnDate <= v.departDate) {
      setError("error.returnBeforeDepart");
      return;
    }
    setLoading(true);
    setFlights([]);
    setSelected(null);
    setShowSpotlight(false);
    setAiPlan(null);
    setAiError(null);
    const normalized: SearchValues = { ...v, from, to };
    setLastSearch(normalized);
    try {
      const res = await searchFn({
        data: {
          from,
          to,
          departDate: v.departDate,
          returnDate: v.returnDate || undefined,
          pax: v.pax,
        },
      });
      if (res.error) setError(res.error);
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
      setError("error.flightsSearchFailed");
    } finally {
      setLoading(false);
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
    setAiContext({
      from: f.outbound.from,
      to: f.outbound.to,
      departDate: f.outbound.date,
      returnDate: f.inbound?.date || lastSearch?.returnDate || undefined,
      pax: lastSearch?.pax ?? 1,
      language: lastSearch?.language || "sl",
    });
    setTimeout(() => {
      document.getElementById("ai-planner")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  async function handleGeneratePlan(
    form: AiPlannerSubmit,
    ctxOverride?: AiPlannerContext & { language?: string },
    modeOverride?: "trip" | "stays",
  ) {
    const ctx = ctxOverride ?? aiContext;
    if (!ctx) return;
    setAiPlan(null);
    setAiError(null);
    setAiLoading(true);
    setTimeout(() => {
      document.getElementById("ai-plan-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    try {
      const wishes = [form.wishes, form.tags.length ? `Oznake: ${form.tags.join(", ")}.` : ""]
        .filter(Boolean)
        .join(" ");
      const clientStartedAt = performance.now();
      console.log("[AiPlan] client: starting plan generation…", {
        from: ctx.from,
        to: ctx.to,
        departDate: ctx.departDate,
        returnDate: ctx.returnDate,
        mode: modeOverride ?? "trip",
      });
      const res = await planFn({
        data: {
          destinationIata: ctx.to,
          originIata: ctx.from,
          departDate: ctx.departDate,
          returnDate: ctx.returnDate || undefined,
          pax: ctx.pax,
          language: ctx.language || "sl",
          pace: form.pace,
          wishes,
          customPrompt: form.customPrompt,
          mode: modeOverride ?? "trip",
        },
      });
      console.log(
        `[AiPlan] client: server responded in ${Math.round(performance.now() - clientStartedAt)}ms`,
        { error: res.error, days: res.plan?.days.length ?? 0 },
      );
      if (res.debug?.length) {
        console.group("[AiPlan] server trace");
        res.debug.forEach((line) => console.log(`[AiPlan] ${line}`));
        console.groupEnd();
      }

      // Plan generation is FREE — no paywall on generation.
      if (res.error) setAiError(res.error);

      // Server enforces routing; only accept plans that passed validation there.
      setAiPlan(res.plan);
      setSavedPlanId(null);
      // Save to "My plans" for ANY logged-in user (free or paid).
      // Paywall only applies to PDF export — see onDownloadClick below.
      if (res.plan && user) {
        const dest = res.plan.destinationName || ctx.to;
        // Defensively normalize to YYYY-MM-DD — never trust upstream date drift.
        const startDate = (ctx.departDate || "").slice(0, 10) || null;
        const endDate = ctx.returnDate ? ctx.returnDate.slice(0, 10) : null;
        const title = `${ctx.from} → ${ctx.to} · ${startDate ?? ctx.departDate}`;
        const basePayload = {
          user_id: user.id,
          title,
          destination: dest,
          start_date: startDate,
          end_date: endDate,
          itinerary: res.plan as never,
          ai_model: "openai-assistant:gpt-4o",
          is_paid: subscription.isActive,
        };

        // Dedupe: a re-generated plan for the same search (same user + destination
        // + exact dates) updates the existing row instead of creating a duplicate
        // trip card in "My trips".
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
          const { error: updErr } = await supabase
            .from("travel_plans")
            .update(basePayload)
            .eq("id", existing.id);
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
    } catch (e) {
      console.error(e);
      setAiError("AI plan se ni uspel generirati.");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-6 pt-16 sm:pt-24 pb-12 text-center">
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold text-foreground tracking-tight">
            {t("hero.title.a")}{" "}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-brand)" }}>
              {t("hero.title.b")}
            </span>{" "}
            {t("hero.title.c")}
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            {t("hero.subtitle")}
          </p>

          <div className="mt-12 max-w-6xl mx-auto text-left" id="flights">
            {(aiPlan || flights.length > 0 || lastSearch) && (
              <div className="mb-4 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearSession();
                    setFlights([]);
                    setSelected(null);
                    setConfirmFlight(null);
                    setAiPlan(null);
                    setAiError(null);
                    setAiContext(null);
                    setLastSearch(null);
                    setPrefill(null);
                    setSavedPlanId(null);
                    setError(null);
                    setShowSpotlight(false);
                  }}
                >
                  🗑️ {t("search.clearNew")}
                </Button>
              </div>
            )}
            <SearchPanel onSearch={handleSearch} loading={loading || aiLoading} initialValues={prefill} />

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

            {!loading && !error && flights.length === 0 && lastSearch && lastSearch.mode === "flights" && (
              <div className="mt-6 rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
                {t("error.noFlights")}
              </div>
            )}

            {(selected || plannerMode === "stays") && !aiLoading && !aiPlan && (
              <AiPlannerPreview context={aiContext} onGenerate={(f) => handleGeneratePlan(f, undefined, plannerMode)} loading={aiLoading} />
            )}

            <div id="ai-plan-anchor" />
            {(aiLoading || aiPlan || aiError) && (
              <>
                <AiPlanView
                  loading={aiLoading}
                  plan={aiPlan}
                  error={aiError}
                  protect={false}
                  onDownloadClick={async () => {
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
                  }}
                  stayInfo={{
                    adults: lastSearch?.stayAdults ?? lastSearch?.pax ?? 2,
                    childrenAges: lastSearch?.childrenAges ?? [],
                    rooms: lastSearch?.rooms ?? 1,
                  }}
                />
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
              {paywall === "register" && t("paywall.registerTitle")}
              {paywall === "pay" && t("paywall.payTitle")}
              {paywall === "daily" && t("paywall.dailyTitle")}
            </DialogTitle>
            <DialogDescription>
              {paywall === "register" && t("paywall.registerDesc")}
              {paywall === "pay" && t("paywall.payDesc")}
              {paywall === "daily" && t("paywall.dailyDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            {paywall === "register" ? (
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
}
