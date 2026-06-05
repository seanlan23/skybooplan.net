import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Calendar, MapPin, Download, Loader2, Lock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AiPlanView } from "@/components/AiPlanView";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { generatePlanPdf } from "@/lib/pdf-export";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { formatLocalDate } from "@/lib/dateUtils";

export const Route = createFileRoute("/_authenticated/my-trips/$planId")({
  head: () => ({ meta: [{ title: "Trip details — Skybooplan" }] }),
  component: TripDetailPage,
});

function TripDetailPage() {
  const { planId } = Route.useParams();
  const { user } = useAuth();
  const subscription = useSubscription();
  const [plan, setPlan] = useState<{
    id: string;
    title: string;
    destination: string;
    start_date: string | null;
    end_date: string | null;
    travel_pace: string | null;
    wishes: string | null;
    cover_image_url: string | null;
    itinerary: AiTripPlan | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("travel_plans")
      .select("id,title,destination,start_date,end_date,travel_pace,wishes,cover_image_url,itinerary")
      .eq("id", planId)
      .eq("user_id", user.id)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError(err?.message ?? "Plan ni bil najden.");
        } else {
          setPlan({
            ...data,
            itinerary: (data.itinerary ?? null) as AiTripPlan | null,
          });
        }
        setLoading(false);
      });
  }, [user, planId]);

  const handleDownload = async () => {
    if (!subscription.isActive || !plan) return;
    setDownloading(true);
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const referrer = typeof document !== "undefined" ? document.referrer || window.location.href : undefined;
    try {
      await generatePlanPdf({
        title: plan.title,
        destination: plan.destination,
        start_date: plan.start_date,
        end_date: plan.end_date,
        travel_pace: plan.travel_pace,
        wishes: plan.wishes,
        cover_image_url: plan.cover_image_url,
        itinerary: (plan.itinerary ?? {}) as Record<string, unknown>,
      });
      if (user) {
        const { logPdfDownload } = await import("@/lib/pdfDownloads.functions");
        await logPdfDownload({
          data: {
            planId: plan.id,
            source: "trip_detail",
            status: "success",
            runtime: "browser",
            referrer,
            requestId,
          },
        }).catch((err) => console.error("[pdf_downloads] log failed", err));
      }
    } catch (e) {
      console.error("PDF export failed", e);
      if (user) {
        const { logPdfDownload } = await import("@/lib/pdfDownloads.functions");
        await logPdfDownload({
          data: {
            planId: plan.id,
            source: "trip_detail",
            status: "failed",
            runtime: "browser",
            referrer,
            requestId,
            errorMessage: e instanceof Error ? e.message : String(e),
          },
        }).catch((err) => console.error("[pdf_downloads] log failed", err));
      }
      alert("Could not generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-12">
        <Link
          to="/my-trips"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Nazaj na My trips
        </Link>

        {loading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-destructive">
            {error}
          </div>
        ) : plan ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold text-foreground">{plan.title}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> {plan.destination}
                  </span>
                  {(plan.start_date || plan.end_date) && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      {plan.start_date && formatLocalDate(plan.start_date)}
                      {plan.end_date && ` – ${formatLocalDate(plan.end_date)}`}
                    </span>
                  )}
                </div>
              </div>
              {subscription.isActive ? (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60 shrink-0"
                  style={{ background: "var(--gradient-warm)" }}
                >
                  {downloading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Preparing PDF…</>
                  ) : (
                    <><Download className="h-4 w-4" /> Download PDF</>
                  )}
                </button>
              ) : (
                <a
                  href="/#pricing"
                  className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 font-semibold text-foreground border border-border bg-muted/50 hover:bg-muted transition-colors shrink-0"
                  title="Upgrade to download PDF"
                >
                  <Lock className="h-4 w-4" /> Unlock PDF download
                </a>
              )}
            </div>

            {plan.itinerary ? (
              <AiPlanView
                loading={false}
                plan={plan.itinerary}
                error={null}
              />
            ) : (
              <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
                Ni podrobnejšega itinerarja za ta plan.
              </div>
            )}
          </>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
