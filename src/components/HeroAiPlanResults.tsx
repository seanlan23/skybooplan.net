import { Link } from "@tanstack/react-router";
import { AiPlanView } from "@/components/AiPlanView";
import { AiPlanLoader } from "@/components/AiPlanLoader";
import { AiPlanSkeletonView } from "@/components/AiPlanSkeletonView";
import type { AiPlannerContext, AiPlannerSubmit } from "@/components/AiPlannerPreview";
import type { AiTripPlan, TripSkeleton } from "@/lib/aiPlan.functions";
import type { TripFlightContext } from "@/lib/flightScheduling";
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
  user: { id: string } | null;
  buildWishes: (form: AiPlannerSubmit | null | undefined) => string;
  normalizeLastPlannerForm: (input: unknown) => AiPlannerSubmit | null;
  onExpandFull: () => void;
  lastSearchPax?: { adults?: number; childrenAges?: number[]; rooms?: number };
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
  user,
  buildWishes,
  normalizeLastPlannerForm,
  onExpandFull,
  lastSearchPax,
}: HeroAiPlanResultsProps) {
  const { t } = useI18n();

  if (!visible) return null;

  const showBlock =
    aiLoading || isGeminiStreaming || aiSkeleton || displayPlan || aiError || aiExpandingFull;
  if (!showBlock) return null;

  const tripDays =
    aiContext?.departDate && aiContext?.returnDate
      ? Math.max(
          1,
          Math.round(
            (new Date(`${aiContext.returnDate}T00:00:00Z`).getTime() -
              new Date(`${aiContext.departDate}T00:00:00Z`).getTime()) /
              86_400_000,
          ) + 1,
        )
      : 7;

  const stayInfo = {
    adults: lastSearchPax?.adults ?? aiContext?.adults ?? aiContext?.pax ?? 2,
    childrenAges: lastSearchPax?.childrenAges ?? aiContext?.childrenAges ?? [],
    rooms: lastSearchPax?.rooms ?? 1,
  };

  return (
    <section
      id="hero-trip-plan"
      className="relative z-10 scroll-mt-20 border-b border-border/60 bg-background"
      aria-live="polite"
    >
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-2 sm:pb-12">
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
                          destination: aiPlan.destinationName ?? aiContext?.to ?? "",
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
              stayInfo={stayInfo}
              plannerWishes={
                lastPlannerForm ? buildWishes(lastPlannerForm) || undefined : undefined
              }
              plannerForm={normalizeLastPlannerForm(lastPlannerForm)}
              destinationIata={aiContext?.to}
              departDate={aiContext?.departDate}
              returnDate={aiContext?.returnDate}
              flights={aiContext?.flights as TripFlightContext | undefined}
            />
          ) : aiLoading || aiExpandingFull ? (
            <AiPlanLoader tripDays={tripDays} startedAt={aiGenStartedAt} />
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
              plannerWishes={
                lastPlannerForm ? buildWishes(lastPlannerForm) || undefined : undefined
              }
              plannerForm={normalizeLastPlannerForm(lastPlannerForm)}
            />
          )}

          {savedPlanId ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-brand/40 bg-brand/10 px-5 py-3 text-sm">
              <span className="font-medium text-foreground">{t("plan.saved")}</span>
              <Link
                to="/my-trips/$planId"
                params={{ planId: savedPlanId }}
                className="font-semibold text-brand hover:underline"
              >
                {t("plan.openDashboard")}
              </Link>
            </div>
          ) : null}

          {aiPlan && !savedPlanId && !user ? (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              {t("plan.loginToSave")}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
