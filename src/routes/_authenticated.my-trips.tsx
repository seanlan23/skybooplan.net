import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, Calendar, Plus, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { formatLocalDate } from "@/lib/dateUtils";

export const Route = createFileRoute("/_authenticated/my-trips")({
  head: () => ({ meta: [{ title: "My trips — Skybooplan" }] }),
  component: MyTripsPage,
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

function MyTripsPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const t = useT();

  useEffect(() => {
    if (!user) return;
    supabase.from("travel_plans")
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
      <main className="flex-1 mx-auto max-w-7xl w-full px-6 py-12">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t("trips.title")}</h1>
            <p className="mt-2 text-muted-foreground">{t("trips.subtitle")}</p>
          </div>
          <Link to="/" className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 font-semibold text-primary-foreground shadow-md"
            style={{ background: "var(--gradient-warm)" }}>
            <Plus className="h-4 w-4" /> {t("trips.new")}
          </Link>
        </div>

        {loading ? (
          <div className="text-muted-foreground">{t("trips.loading")}</div>
        ) : plans.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-border bg-card/50 p-16 text-center">
            <Sparkles className="h-10 w-10 mx-auto text-brand mb-4" />
            <h2 className="text-xl font-semibold text-foreground">{t("trips.none")}</h2>
            <p className="mt-2 text-muted-foreground">{t("trips.noneSub")}</p>
            <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-warm)" }}>
              {t("trips.planTrip")}
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((p) => (
              <Link
                key={p.id}
                to="/my-trips/$planId"
                params={{ planId: p.id }}
                className="group rounded-3xl bg-card border border-border shadow-[var(--shadow-card)] overflow-hidden hover:shadow-lg transition-shadow flex flex-col"
              >
                {p.cover_image_url && (
                  <img src={p.cover_image_url} alt={p.destination} className="h-40 w-full object-cover" />
                )}
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="font-semibold text-foreground truncate group-hover:text-brand transition-colors">{p.title}</h3>
                  <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {p.destination}
                  </div>
                  {p.start_date && (
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatLocalDate(p.start_date)}
                      {p.end_date && ` – ${formatLocalDate(p.end_date)}`}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
