import { useEffect, useState } from "react";
import { History, Plane, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { SearchValues } from "@/components/SearchPanel";
import { useI18n } from "@/lib/i18n";
import { formatPaxUiCount } from "@/lib/slovenePax";

type Row = {
  id: string;
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string | null;
  pax: number;
  results_count: number;
  created_at: string;
};

export function FlightSearchHistory({
  refreshKey,
  onRepeat,
}: {
  refreshKey: number;
  onRepeat: (v: SearchValues) => void;
}) {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setRows([]);
      return;
    }
    setLoading(true);
    supabase
      .from("flight_searches")
      .select("id,origin,destination,depart_date,return_date,pax,results_count,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setRows((data ?? []) as Row[]);
        setLoading(false);
      });
  }, [user, refreshKey]);

  async function handleDelete(id: string) {
    setRows((r) => r.filter((x) => x.id !== id));
    await supabase.from("flight_searches").delete().eq("id", id);
  }

  if (!user) return null;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card/60 backdrop-blur-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="h-4 w-4 text-brand" />
          {t("history.title")}
          {rows.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">({rows.length})</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{open ? t("common.hide") : t("common.show")}</span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">{t("history.empty")}</div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Plane className="h-4 w-4 shrink-0 text-brand" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {r.origin} → {r.destination}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {formatPaxUiCount(r.pax, lang, t("history.paxLabel"), t("history.paxLabel"))}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.depart_date}
                        {r.return_date ? ` · ${r.return_date}` : ` · ${t("trip.oneway")}`}
                        {" · "}
                        {t("history.resultsCount").replace("{n}", String(r.results_count))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() =>
                        onRepeat({
                          mode: "flights",
                          from: r.origin,
                          to: r.destination,
                          departDate: r.depart_date,
                          returnDate: r.return_date ?? "",
                          pax: r.pax,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand hover:bg-brand/10 transition-colors"
                      title={t("history.repeatTitle")}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t("history.repeat")}
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title={t("common.delete")}
                      aria-label={t("common.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
