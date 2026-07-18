import { ExternalLink, Sparkles, Plane, Check } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  elapsedMinutesBetween,
  formatTravelDuration,
  parseDurationMinutes,
  parseMakeFlightRoute,
  pickTravelDurationRaw,
  skyscannerUrlForMakeFlight,
  type MakeSearchFlight,
} from "@/lib/makeSearch";
import { cn } from "@/lib/utils";

function formatPrice(eur: number, lang: string): string {
  if (!Number.isFinite(eur) || eur <= 0) return "—";
  return new Intl.NumberFormat(lang === "sl" ? "sl-SI" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(eur);
}

function formatStopPart(
  part: string,
  directLabel: string,
  stopLabel: string,
  stopsLabel: string,
  viaLabel: string,
): string {
  const trimmed = part.trim();
  if (trimmed === "0") return directLabel;

  // "1|PEK" or "2|IST,DXB"
  const withVia = trimmed.match(/^(\d+)\|([A-Z]{3}(?:,[A-Z]{3})*)$/i);
  if (withVia) {
    const count = Number.parseInt(withVia[1]!, 10);
    const airports = withVia[2]!.toUpperCase();
    const countLabel =
      count === 0 ? directLabel : count === 1 ? `1 ${stopLabel}` : `${count} ${stopsLabel}`;
    return `${countLabel} · ${viaLabel} ${airports}`;
  }

  const asNumber = Number.parseInt(trimmed, 10);
  if (Number.isFinite(asNumber) && String(asNumber) === trimmed) {
    if (asNumber === 0) return directLabel;
    if (asNumber === 1) return `1 ${stopLabel}`;
    return `${asNumber} ${stopsLabel}`;
  }
  return trimmed || "—";
}

function formatStops(
  postanki: string,
  directLabel: string,
  stopLabel: string,
  stopsLabel: string,
  viaLabel: string,
): string {
  const trimmed = postanki.trim();
  if (!trimmed) return "—";
  if (trimmed.includes("/")) {
    return trimmed
      .split("/")
      .map((part) => formatStopPart(part, directLabel, stopLabel, stopsLabel, viaLabel))
      .join(" · ");
  }
  return formatStopPart(trimmed, directLabel, stopLabel, stopsLabel, viaLabel);
}

function localizeBadge(badge: string, t: (key: never) => string): string {
  const [keyPart, origin] = badge.split(" · ").map((s) => s.trim());
  const key = (keyPart || "").toLowerCase();
  const label =
    key === "cheapest" || key.includes("najcenej")
      ? t("results.cheapestBadge" as never)
      : key === "best_value" || key.includes("vrednost") || key.includes("best value")
        ? t("results.bestValueBadge" as never)
        : key === "alternative" || key.includes("alternativa")
          ? t("results.alternativeBadge" as never)
          : keyPart || badge;
  return origin ? `${label} · ${origin}` : label;
}

function badgeClasses(badge: string): string {
  const lower = badge.toLowerCase();
  if (lower.includes("najcenej") || lower.includes("cheap")) {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-sky-100 text-sky-700";
}

/** Prefer HH:mm; fall back to last time-looking chunk in a human datetime. */
function displayTime(preferred?: string, fallback = ""): string {
  if (preferred && /^\d{1,2}:\d{2}$/.test(preferred)) return preferred;
  const match = fallback.match(/(\d{1,2}:\d{2})\s*$/);
  return match?.[1] ?? fallback;
}

function displayDate(isoDate?: string, humanFallback = "", lang = "en"): string {
  if (isoDate && /^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const d = new Date(`${isoDate}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat(lang === "sl" ? "sl-SI" : "en-GB", {
        day: "numeric",
        month: "short",
      }).format(d);
    }
  }
  // "26. okt. 2026, 06:35" / "26 Oct 2026, 06:35"
  const match = humanFallback.match(/^(\d{1,2}[.\s]\s*\p{L}+\.?)/u);
  return match?.[1]?.trim() ?? "";
}

function minutesToDurationLabel(mins: number): string {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Resolve display duration. Prefer timezone-aware ISO timestamps.
 * Never show naive HH:mm gaps (MXP 10:30 → HKT 17:50 ≠ 7h20m on a real airliner).
 */
function resolveDurationLabel(
  stored: string | undefined,
  departIso?: string,
  arriveIso?: string,
  hasStops = false,
): string | undefined {
  const isoMins =
    departIso && arriveIso ? elapsedMinutesBetween(departIso, arriveIso) : 0;
  const isoLabel = minutesToDurationLabel(isoMins);
  const best = pickTravelDurationRaw(isoLabel, stored);
  const bestMins = parseDurationMinutes(best);

  // With stops, reject absurdly short claims left over from wall-clock math.
  if (hasStops && bestMins > 0 && bestMins < 8 * 60 && !isoLabel) {
    return undefined;
  }

  return best ? formatTravelDuration(best) || best : undefined;
}

function AirlineMark({ name, code }: { name: string; code?: string }) {
  const initials = (code || name)
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-0.5 sm:w-12">
      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-border/80 bg-white shadow-sm">
        {code ? (
          <img
            src={`https://images.kiwi.com/airlines/64/${code}.png`}
            alt=""
            loading="lazy"
            className="h-7 w-7 object-contain"
            onError={(e) => {
              const img = e.currentTarget;
              img.style.display = "none";
              const fb = img.nextElementSibling as HTMLElement | null;
              if (fb) fb.style.display = "flex";
            }}
          />
        ) : null}
        <span
          className="h-full w-full items-center justify-center text-[10px] font-bold tracking-wide text-muted-foreground"
          style={{ display: code ? "none" : "flex" }}
        >
          {initials || "—"}
        </span>
      </div>
      <span className="max-w-[3.25rem] truncate text-[10px] leading-tight text-muted-foreground">
        {name}
      </span>
    </div>
  );
}

function CompactLeg({
  from,
  to,
  departTime,
  arriveTime,
  dateLabel,
  durationLabel,
  stopsLabel,
  dayOffset,
}: {
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  dateLabel: string;
  durationLabel?: string;
  stopsLabel: string;
  dayOffset?: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
      <div className="shrink-0">
        <div className="text-lg font-bold tabular-nums leading-none text-foreground sm:text-xl">
          {departTime || "—"}
        </div>
        <div className="mt-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
          {from}
          {dateLabel ? <span className="text-muted-foreground/80"> · {dateLabel}</span> : null}
        </div>
      </div>

      <div className="flex min-w-[4.5rem] flex-1 flex-col items-center px-1 sm:min-w-[5.5rem]">
        <div className="text-[11px] font-medium tabular-nums text-muted-foreground">
          {durationLabel || "—"}
        </div>
        <div className="relative my-0.5 flex w-full max-w-[7rem] items-center">
          <span className="h-px flex-1 bg-border" />
          <span className="mx-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card">
            <Plane className="h-2 w-2 -rotate-45 text-muted-foreground" aria-hidden />
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="text-[10px] font-medium text-sky-700">{stopsLabel}</div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-lg font-bold tabular-nums leading-none text-foreground sm:text-xl">
          {arriveTime || "—"}
          {dayOffset && dayOffset > 0 ? (
            <sup className="ml-0.5 text-[10px] font-semibold text-rose-600">+{dayOffset}</sup>
          ) : null}
        </div>
        <div className="mt-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
          {to}
        </div>
      </div>
    </div>
  );
}

export type FlightCardSearchMeta = {
  from?: string;
  to?: string;
  departDate?: string;
  returnDate?: string;
};

export function FlightCard({
  flight,
  className,
  adults = 1,
  searchMeta,
  selectedForAi = false,
  onSelectForAiPlan,
  isFirst = false,
}: {
  flight: MakeSearchFlight;
  className?: string;
  adults?: number;
  searchMeta?: FlightCardSearchMeta | null;
  selectedForAi?: boolean;
  onSelectForAiPlan?: (flight: MakeSearchFlight) => void;
  isFirst?: boolean;
}) {
  const { t, lang } = useI18n();

  const directLabel = t("results.direct" as never);
  const stopLabel = t("results.stop" as never);
  const stopsLabel = t("results.stops" as never);
  const viaLabel = t("results.via" as never);

  const route = parseMakeFlightRoute(flight.destinacija);
  const from = flight.origin_iata || route.from || searchMeta?.from || "—";
  const to = flight.destination_iata || route.to || searchMeta?.to || "—";

  const outStopsRaw = flight.postanki.includes("/")
    ? flight.postanki.split("/")[0]!
    : flight.postanki;
  const inStopsRaw = flight.postanki.includes("/") ? flight.postanki.split("/")[1]! : "";

  const outboundStops = formatStopPart(outStopsRaw, directLabel, stopLabel, stopsLabel, viaLabel);
  const inboundStops = inStopsRaw
    ? formatStopPart(inStopsRaw, directLabel, stopLabel, stopsLabel, viaLabel)
    : "";

  const skyscannerUrl = skyscannerUrlForMakeFlight(flight, adults, searchMeta ?? undefined);
  const bookUrl = skyscannerUrl || flight.booking_url;

  const outDepart = displayTime(flight.outbound_depart, flight.odhod);
  const outArrive = displayTime(flight.outbound_arrive);
  const inDepart = displayTime(flight.inbound_depart, flight.povratek);
  const inArrive = displayTime(flight.inbound_arrive);
  const outDate = displayDate(flight.depart_date, flight.odhod, lang);
  const inDate = displayDate(flight.return_date, flight.povratek ?? "", lang);
  const outHasStops = !/^0(?:\||$)/.test(outStopsRaw.trim()) && outStopsRaw.trim() !== "0";
  const inHasStops = Boolean(inStopsRaw) && !/^0(?:\||$)/.test(inStopsRaw.trim());
  const outDuration = resolveDurationLabel(
    flight.outbound_duration,
    flight.outbound_depart_iso,
    flight.outbound_arrive_iso,
    outHasStops,
  );
  const inDuration = resolveDurationLabel(
    flight.inbound_duration,
    flight.inbound_depart_iso,
    flight.inbound_arrive_iso,
    inHasStops,
  );
  const badgeLabel = flight.badge ? localizeBadge(flight.badge, t) : "";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-card transition-all",
        selectedForAi
          ? "border-sky-400 shadow-[0_0_0_2px_color-mix(in_oklab,#38bdf8_20%,transparent)]"
          : "border-border hover:border-sky-300 hover:shadow-sm",
        className,
      )}
    >
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_118px]">
        <div className="divide-y divide-border px-3 py-1.5 sm:px-3.5">
          {badgeLabel ? (
            <div className="pb-1.5 pt-1">
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  badgeClasses(flight.badge || badgeLabel),
                )}
              >
                {badgeLabel}
              </span>
            </div>
          ) : null}

          <div className="flex items-center gap-2.5 py-2 sm:gap-3">
            <AirlineMark name={flight.prevoznik} code={flight.airline_iata} />
            <CompactLeg
              from={from}
              to={to}
              departTime={outDepart}
              arriveTime={outArrive}
              dateLabel={outDate}
              durationLabel={outDuration}
              stopsLabel={outboundStops}
              dayOffset={flight.outbound_arrive_day_offset}
            />
          </div>

          {flight.povratek || flight.inbound_depart ? (
            <div className="flex items-center gap-2.5 py-2 sm:gap-3">
              <AirlineMark name={flight.prevoznik} code={flight.airline_iata} />
              <CompactLeg
                from={to}
                to={from}
                departTime={inDepart}
                arriveTime={inArrive}
                dateLabel={inDate}
                durationLabel={inDuration}
                stopsLabel={
                  inboundStops ||
                  formatStops(flight.postanki, directLabel, stopLabel, stopsLabel, viaLabel)
                }
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-row items-center justify-between gap-3 border-t border-border bg-muted/20 px-3 py-2.5 sm:flex-col sm:items-end sm:justify-center sm:border-l sm:border-t-0 sm:px-2.5 sm:py-3 sm:text-right">
          <div>
            <p className="text-xl font-bold tabular-nums leading-none text-foreground">
              {formatPrice(flight.cena_eur, lang)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {t("results.perAdult" as never)}
            </p>
          </div>

          {bookUrl ? (
            <a
              href={bookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-600 sm:w-full"
            >
              {t("flightCard.book" as never)}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center justify-center rounded-lg bg-sky-500/50 px-3 py-1.5 text-xs font-semibold text-white sm:w-full"
            >
              {t("flightCard.book" as never)}
            </button>
          )}
        </div>
      </div>

      {onSelectForAiPlan ? (
        <div className="border-t border-border px-3 py-1.5">
          <button
            type="button"
            data-select-ai-plan={isFirst ? "first" : undefined}
            onClick={() => onSelectForAiPlan(flight)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
              selectedForAi
                ? "bg-sky-500 text-white"
                : "text-sky-700 hover:bg-sky-50",
            )}
          >
            {selectedForAi ? (
              <>
                <Check className="h-3 w-3" aria-hidden />
                {t("results.selectedAi" as never)}
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" aria-hidden />
                {t("results.selectAiPlan" as never)}
              </>
            )}
          </button>
        </div>
      ) : null}
    </article>
  );
}
