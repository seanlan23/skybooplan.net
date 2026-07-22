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
import { LogoMark } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { readStoredLang, translate, useT } from "@/lib/i18n";
import { formatLocalDate } from "@/lib/dateUtils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => {
    const lang = readStoredLang();
    return { meta: [{ title: translate(lang, "dashboard.metaTitle") }] };
  },
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

const heroBg =
  "linear-gradient(165deg, oklch(0.99 0.01 240) 0%, oklch(0.96 0.04 235) 42%, oklch(0.98 0.03 70) 100%)";
const skyBtn = { background: "linear-gradient(135deg, #0EA5E9, #0284C7)" };

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
    <div className="flex min-h-screen flex-col" style={{ background: heroBg }}>
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <section className="mb-10 overflow-hidden rounded-[28px] border border-sky-200/60 bg-white/90 px-6 py-8 shadow-[0_18px_40px_rgba(2,132,199,0.08)] sm:px-10 sm:py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 text-sky-600">
                <LogoMark size={22} />
                <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                  {t("dashboard.badge")}
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {t("dashboard.greeting").replace("{name}", displayName)}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
                {t("dashboard.subtitle")}
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-md transition-shadow hover:shadow-lg"
              style={skyBtn}
            >
              <Plus className="h-4 w-4" />
              {t("dashboard.planTrip")}
            </Link>
          </div>

          {!loading && plans.length > 0 && (
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <StatCard
                label={t("dashboard.statPlans")}
                value={String(plans.length)}
                icon={<LayoutGrid className="h-4 w-4" />}
              />
              <StatCard
                label={t("dashboard.statLatest")}
                value={plans[0]?.destination ?? "—"}
                icon={<MapPin className="h-4 w-4" />}
              />
              <StatCard
                label={t("dashboard.statNext")}
                value={
                  plans.find((p) => p.start_date)?.start_date
                    ? formatLocalDate(plans.find((p) => p.start_date)!.start_date!)
                    : "—"
                }
                icon={<Calendar className="h-4 w-4" />}
              />
            </div>
          )}
        </section>

        {loading ? (
          <div className="flex items-center justify-center gap-3 rounded-[28px] border border-sky-200/60 bg-white/80 py-24 shadow-[0_12px_30px_rgba(2,132,199,0.06)]">
            <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
            <span className="text-slate-500">{t("trips.loading")}</span>
          </div>
        ) : plans.length === 0 ? (
          <section className="rounded-[28px] border border-sky-200/60 bg-white px-8 py-14 text-center shadow-[0_18px_40px_rgba(2,132,199,0.08)] sm:px-14">
            <div className="mx-auto flex max-w-md flex-col items-center">
              <div
                className="mb-6 grid h-16 w-16 place-items-center rounded-full"
                style={{
                  background:
                    "linear-gradient(145deg, rgba(14,165,233,0.12), rgba(244,162,97,0.16))",
                }}
              >
                <Sparkles className="h-7 w-7 text-sky-600" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                {t("dashboard.emptyTitle")}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {t("dashboard.emptyHint")}
              </p>
              <Link
                to="/"
                className="mt-8 inline-flex items-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-md transition-shadow hover:shadow-lg"
                style={skyBtn}
              >
                <Sparkles className="h-4 w-4" />
                {t("dashboard.planTrip")}
              </Link>
            </div>
          </section>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <Link
                key={plan.id}
                to="/my-trips/$planId"
                params={{ planId: plan.id }}
                className="group flex flex-col overflow-hidden rounded-[24px] border border-sky-200/60 bg-white shadow-[0_12px_30px_rgba(2,132,199,0.06)] transition-all hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-[0_18px_40px_rgba(2,132,199,0.12)]"
              >
                <div className="relative h-44 w-full overflow-hidden bg-sky-50">
                  {plan.cover_image_url ? (
                    <img
                      src={plan.cover_image_url}
                      alt={plan.destination}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{
                        background:
                          "linear-gradient(145deg, rgba(14,165,233,0.12), rgba(244,162,97,0.14))",
                      }}
                    >
                      <MapPin className="h-10 w-10 text-sky-400/70" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="truncate font-semibold text-slate-900 transition-colors group-hover:text-sky-700">
                    {plan.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                    <span className="truncate">{plan.destination}</span>
                  </div>
                  {plan.start_date && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
                      <Calendar className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                      {formatLocalDate(plan.start_date)}
                      {plan.end_date && ` – ${formatLocalDate(plan.end_date)}`}
                    </div>
                  )}
                  <p className="mt-4 text-xs font-semibold text-sky-600 opacity-0 transition-opacity group-hover:opacity-100">
                    {t("dashboard.openPlan")} →
                  </p>
                </div>
              </Link>
            ))}

            <Link
              to="/"
              className="flex min-h-[280px] flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-sky-200 bg-white/50 p-6 text-center transition-colors hover:border-sky-400 hover:bg-sky-50/80"
            >
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-sky-100 text-sky-600">
                <Plus className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-slate-900">{t("dashboard.addPlan")}</p>
              <p className="mt-1 text-xs text-slate-500">{t("dashboard.addPlanHint")}</p>
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
    <div className="rounded-2xl border border-sky-100 bg-sky-50/60 px-4 py-3.5">
      <div className="flex items-center gap-2 text-sky-600">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1.5 truncate text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
