import { ArrowRight, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import type { MakeSearchFlight } from "@/lib/makeSearch";
import { cn } from "@/lib/utils";

function formatPrice(eur: number): string {
  if (!Number.isFinite(eur) || eur <= 0) return "—";
  return new Intl.NumberFormat("sl-SI", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(eur);
}

function formatStops(postanki: string, directLabel: string, stopLabel: string, stopsLabel: string): string {
  const trimmed = postanki.trim();
  if (!trimmed) return "—";
  if (trimmed === "0") return directLabel;
  const asNumber = Number.parseInt(trimmed, 10);
  if (Number.isFinite(asNumber)) {
    if (asNumber === 0) return directLabel;
    if (asNumber === 1) return `1 ${stopLabel}`;
    return `${asNumber} ${stopsLabel}`;
  }
  return trimmed;
}

export function FlightCard({
  flight,
  className,
}: {
  flight: MakeSearchFlight;
  className?: string;
}) {
  const { t } = useI18n();

  const stopsText = formatStops(
    flight.postanki,
    t("results.direct" as never),
    t("results.stop" as never),
    t("results.stops" as never),
  );

  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Plane className="h-4 w-4 shrink-0" aria-hidden />
            <span>{flight.prevoznik}</span>
          </div>
          <h3 className="mt-1 text-xl font-bold text-foreground">{flight.destinacija}</h3>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold tabular-nums text-foreground">{formatPrice(flight.cena_eur)}</p>
          <p className="text-xs text-muted-foreground">{t("results.perAdult" as never)}</p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t("flightCard.departure" as never)}</dt>
          <dd className="font-semibold text-foreground">{flight.odhod}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("flightCard.stops" as never)}</dt>
          <dd className="font-semibold text-foreground">{stopsText}</dd>
        </div>
      </dl>

      {flight.ai_povzetek ? (
        <p className="mt-4 rounded-xl bg-muted/60 px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
          {flight.ai_povzetek}
        </p>
      ) : null}

      <div className="mt-5">
        {flight.booking_url ? (
          <Button asChild className="w-full sm:w-auto">
            <a href={flight.booking_url} target="_blank" rel="noopener noreferrer">
              {t("flightCard.book" as never)}
              <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </a>
          </Button>
        ) : (
          <Button type="button" disabled className="w-full sm:w-auto">
            {t("flightCard.book" as never)}
            <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    </article>
  );
}
