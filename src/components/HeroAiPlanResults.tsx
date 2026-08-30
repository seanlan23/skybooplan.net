import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { AiPlanView } from "@/components/AiPlanView";
import { AiPlanLoader } from "@/components/AiPlanLoader";
import { AiPlanSkeletonView } from "@/components/AiPlanSkeletonView";
import type { AiPlannerContext, AiPlannerSubmit } from "@/components/AiPlannerPreview";
import type { AiTripPlan, TripSkeleton } from "@/lib/aiPlan.functions";
import type { TripFlightContext } from "@/lib/flightScheduling";
import { inclusiveCalendarDayCount } from "@/lib/dateUtils";
import { useI18n } from "@/lib/i18n";

type HeroAiPlanResultsProps = {
  visible: boolean;
  aiLoading: boolean;
  aiExpandingFull: boolean;
  isGeminiStreaming: boolean;
  displayPlan: AiTripPlan | null;
  aiSkeleton: TripSkeleton | null;
  aiError: string | null;
  aiContext: (AiPlannerContext & { language?: string }) | null;
  aiPlan: AiTripPlan | null;
  lastPlannerForm: AiPlannerSubmit | null;
  aiGenStartedAt: number | null;
  streamExpectedDays: number;
  savedPlanId: string | null;
  planSaveError?: string | null;
  user: { id: string; email?: string | null } | null;
  buildWishes: (form: AiPlannerSubmit | null | undefined) => string;
  normalizeLastPlannerForm: (input: unknown) => AiPlannerSubmit | null;
  onExpandFull: () => void;
  onClearPlan?: () => void;
  onRetrySave?: () => void;
  onEmailPlan?: (plan: AiTripPlan) => void | Promise<void>;
  onDownloadPlan?: (plan: AiTripPlan) => void | Promise<void>;
  lastSearchPax?: { adults?: number; childrenAges?: number[]; rooms?: number };
  flightBookingUrl?: string;
};

export function HeroAiPlanResults({
  visible,
  aiLoading,
  aiExpandingFull,
  isGeminiStreaming,
  displayPlan,
  aiSkeleton,
  aiError,
  aiContext,
  aiPlan,
  lastPlannerForm,
  aiGenStartedAt,
  streamExpectedDays,
  savedPlanId,
  planSaveError = null,
  user,
  buildWishes,
  normalizeLastPlannerForm,
  onExpandFull,
  onClearPlan,
  onRetrySave,
  onEmailPlan,
  onDownloadPlan,
  lastSearchPax,
  flightBookingUrl,
}: HeroAiPlanResultsProps) {
  const { t } = useI18n();
  const showBlock =
    aiLoading || isGeminiStreaming || aiSkeleton || displayPlan || aiError || aiExpandingFull;

  useEffect(() => {
    if (!visible || !displayPlan?.days?.length) return;
    void import("@/lib/pdf-export").then((m) => m.preloadPdfFonts()).catch(() => undefined);
  }, [visible, displayPlan]);

  if (!visible || !showBlock) return null;

  const tripDays =
    aiContext?.departDate && aiContext?.returnDate
      ? (inclusiveCalendarDayCount(aiContext.departDate, aiContext.returnDate) ?? 7)
      : 7;

  const stayAdults = lastSearchPax?.adults ?? aiContext?.adults ?? aiContext?.pax ?? 2;
  const stayInfo = {
    adults: stayAdults,
    childrenAges: lastSearchPax?.childrenAges ?? aiContext?.childrenAges ?? [],
    rooms: lastSearchPax?.rooms ?? Math.max(1, Math.ceil(stayAdults / 2)),
  };

  const loaderOrbit =
    aiContext?.groundTransportMode === "motorhome" ||
    displayPlan?.groundTransportMode === "motorhome" ||
    displayPlan?.accommodationMode === "motorhome" ||
    aiSkeleton?.accommodationMode === "motorhome"
      ? ("motorhome" as const)
      : aiContext?.groundTransportMode === "car" ||
          displayPlan?.groundTransportMode === "car"
        ? ("car" as const)
        : ("flight" as const);

  return (
    <section
      id="hero-trip-plan"
      className="relative z-10 -mt-px scroll-mt-20 border-b border-border/60 bg-background"
      aria-live="polite"
    >
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-6 sm:pb-12 sm:pt-8">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
          {t("heroTrip.planTitle" as never)}
        </h2>

        <div id="hero-ai-plan-anchor" className="mt-4 sm:mt-5">
          {displayPlan ? (
            <AiPlanView
              loading={false}
              plan={displayPlan}
              streaming={isGeminiStreaming}
              expectedDayCount={streamExpectedDays}
              error={aiError}
              pax={aiContext?.pax ?? 1}
              protect={false}
              onClearPlan={onClearPlan}
              onDownloadClick={
                displayPlan && onDownloadPlan
                  ? () => void onDownloadPlan(aiPlan ?? displayPlan)
                  : undefined
              }
              onEmailClick={
                displayPlan && onEmailPlan
                  ? () => void onEmailPlan(aiPlan ?? displayPlan)
                  : undefined
              }
              stayInfo={stayInfo}
              plannerWishes={
                lastPlannerForm ? buildWishes(lastPlannerForm) || undefined : undefined
              }
              plannerForm={normalizeLastPlannerForm(lastPlannerForm)}
              destinationIata={aiContext?.to}
              departDate={aiContext?.departDate}
              returnDate={aiContext?.returnDate}
              flights={aiContext?.flights as TripFlightContext | undefined}
              flightTotalEur={aiContext?.flightTotalEur}
              flightBookingUrl={flightBookingUrl}
              loaderOrbit={loaderOrbit}
            />
          ) : aiLoading || aiExpandingFull ? (
            <AiPlanLoader
              tripDays={tripDays}
              startedAt={aiGenStartedAt}
              destination={aiContext?.to}
              orbit={loaderOrbit}
            />
          ) : (
            <AiPlanSkeletonView
              skeleton={aiSkeleton}
              loading={aiLoading}
              expanding={aiExpandingFull}
              error={aiError}
              pax={aiContext?.pax ?? 1}
              tripDays={tripDays}
              genStartedAt={aiGenStartedAt}
              destinationIata={aiContext?.to}
              departDate={aiContext?.departDate}
              language={aiContext?.language}
              flights={aiContext?.flights as TripFlightContext | undefined}
              stayInfo={stayInfo}
              onExpandFull={onExpandFull}
              flightTotalEur={aiContext?.flightTotalEur}
              plannerWishes={
                lastPlannerForm ? buildWishes(lastPlannerForm) || undefined : undefined
              }
              plannerForm={normalizeLastPlannerForm(lastPlannerForm)}
            />
          )}

          {savedPlanId ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-5 py-3 text-sm">
              <span className="font-medium text-foreground">{t("plan.saved")}</span>
              <Link
                to="/dashboard"
                className="font-semibold text-brand hover:underline"
              >
                {t("plan.openDashboard")}
              </Link>
            </div>
          ) : null}

          {aiPlan && !savedPlanId && (!user || planSaveError === "login_required") ? (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              {t("plan.loginToSave")}
            </div>
          ) : null}

          {aiPlan && !savedPlanId && user && planSaveError && planSaveError !== "login_required" ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-3 text-sm text-rose-900">
              <span>{t("plan.saveFailed" as never)}</span>
              <div className="flex flex-wrap items-center gap-3">
                {onEmailPlan ? (
                  <button
                    type="button"
                    onClick={() => void onEmailPlan(aiPlan)}
                    className="font-semibold text-rose-900 underline-offset-2 hover:underline"
                  >
                    {t("plan.emailCta" as never)}
                  </button>
                ) : null}
                {onRetrySave ? (
                  <button
                    type="button"
                    onClick={onRetrySave}
                    className="font-semibold text-rose-800 underline-offset-2 hover:underline"
                  >
                    {t("plan.retrySave" as never)}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
