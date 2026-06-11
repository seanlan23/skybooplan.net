import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Calendar,
  LayoutGrid,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { formatLocalDate } from "@/lib/dateUtils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Skybooplan" }] }),
  component: DashboardPage,
});

type Plan = {
  id: string;
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
  created_at: string;
};

function DashboardPage() {
  const { user } = useAuth();
  const t = useT();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split("@")[0] ??
    t("dashboard.traveler");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("travel_plans")
      .select("id,title,destination,start_date,end_date,cover_image_url,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPlans(data ?? []);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--gradient-hero)" }}>
      <SiteHeader />

      <main className="flex-1 mx-auto w-full max-w-7xl px-6 py-12">
        <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">
              {t("dashboard.badge")}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {t("dashboard.greeting").replace("{name}", displayName)}
            </h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">{t("dashboard.subtitle")}</p>
          </div>
          <Link
            to="/"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition-shadow hover:shadow-lg"
            style={{ background: "var(--gradient-warm)" }}
          >
            <Plus className="h-4 w-4" />
            {t("dashboard.planTrip")}
          </Link>
        </div>

        {!loading && plans.length > 0 && (
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatCard
              label={t("dashboard.statPlans")}
              value={String(plans.length)}
              icon={<LayoutGrid className="h-5 w-5" />}
            />
            <StatCard
              label={t("dashboard.statLatest")}
              value={plans[0]?.destination ?? "—"}
              icon={<MapPin className="h-5 w-5" />}
            />
            <StatCard
              label={t("dashboard.statNext")}
              value={
                plans.find((p) => p.start_date)?.start_date
                  ? formatLocalDate(plans.find((p) => p.start_date)!.start_date!)
                  : "—"
              }
              icon={<Calendar className="h-5 w-5" />}
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-3xl border border-border bg-card/60 py-24">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
            <span className="text-muted-foreground">{t("trips.loading")}</span>
          </div>
        ) : plans.length === 0 ? (
          <section className="rounded-3xl border border-border bg-card/80 p-10 shadow-[var(--shadow-card)] backdrop-blur-sm sm:p-14">
            <div className="mx-auto flex max-w-lg flex-col items-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                <Sparkles className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">{t("dashboard.emptyTitle")}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t("dashboard.emptyHint")}
              </p>
              <Link
                to="/"
                className="mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-shadow hover:shadow-lg"
                style={{ background: "var(--gradient-warm)" }}
              >
                <Sparkles className="h-4 w-4" />
                {t("dashboard.planTrip")}
              </Link>
            </div>
          </section>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <Link
                key={plan.id}
                to="/my-trips/$planId"
                params={{ planId: plan.id }}
                className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="relative h-44 w-full overflow-hidden bg-muted">
                  {plan.cover_image_url ? (
                    <img
                      src={plan.cover_image_url}
                      alt={plan.destination}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/10 to-indigo-500/10">
                      <MapPin className="h-10 w-10 text-brand/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="truncate font-semibold text-foreground transition-colors group-hover:text-brand">
                    {plan.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{plan.destination}</span>
                  </div>
                  {plan.start_date && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      {formatLocalDate(plan.start_date)}
                      {plan.end_date && ` – ${formatLocalDate(plan.end_date)}`}
                    </div>
                  )}
                  <p className="mt-4 text-xs font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                    {t("dashboard.openPlan")} →
                  </p>
                </div>
              </Link>
            ))}

            <Link
              to="/"
              className="flex min-h-[280px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-border/80 bg-muted/20 p-6 text-center transition-colors hover:border-brand/40 hover:bg-brand/5"
            >
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Plus className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">{t("dashboard.addPlan")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("dashboard.addPlanHint")}</p>
            </Link>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-5 py-4 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 truncate text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
