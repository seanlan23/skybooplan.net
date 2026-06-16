import { Loader2 } from "lucide-react";
import { FlightCard } from "@/components/FlightCard";
import { useI18n } from "@/lib/i18n";
import type { MakeSearchFlight } from "@/lib/makeSearch";

export function HeroFlightResults({
  flights,
  loading,
  error,
  visible,
}: {
  flights: MakeSearchFlight[];
  loading: boolean;
  error: string | null;
  visible: boolean;
}) {
  const { t } = useI18n();

  if (!visible) return null;

  return (
    <section
      id="hero-flight-results"
      className="relative z-10 border-b border-border/60 bg-background"
      aria-live="polite"
    >
      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-12">
        <h2 className="text-xl font-bold text-foreground sm:text-2xl">
          {t("heroSearch.title" as never)}
        </h2>

        {loading ? (
          <div className="mt-6 flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            <span>{t("cta.searchingFlights" as never)}</span>
          </div>
        ) : null}

        {!loading && error ? (
          <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error.startsWith("heroSearch.") || error.startsWith("error.")
              ? t(error as never)
              : error}
          </p>
        ) : null}

        {!loading && !error && flights.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {flights.map((flight) => (
              <FlightCard key={flight.id} flight={flight} />
            ))}
          </div>
        ) : null}

        {!loading && !error && flights.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("heroSearch.empty" as never)}</p>
        ) : null}
      </div>
    </section>
  );
}
