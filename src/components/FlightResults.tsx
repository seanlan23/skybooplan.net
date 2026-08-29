import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plane, Sparkles, Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DuffelFlight } from "@/lib/flights.functions";
import { resolveInboundRoute } from "@/lib/flightSearch";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { formatPaxUiCount } from "@/lib/slovenePax";
import {
  FlightFilters,
  defaultFilters,
  bucketForHour,
  useFlightFilterBounds,
  type FlightFiltersState,
} from "@/components/FlightFilters";

type SortKey = "cheapest" | "fastest" | "earliest";

/** Initial visible cards; each "load more" adds the same batch. */
const FLIGHTS_PAGE_SIZE = 6;

function parseDurationToMin(s: string): number {
  // "16h 35m" or "1d 2h 55m"
  const d = /(\d+)\s*d/.exec(s);
  const h = /(\d+)\s*h/.exec(s);
  const m = /(\d+)\s*m/.exec(s);
  return (d ? +d[1] * 1440 : 0) + (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
}

function FlightLeg({
  airline,
  airlineCode,
  depart,
  arrive,
  from,
  to,
  duration,
  arriveDayOffset,
  stops,
}: {
  airline: string;
  airlineCode: string;
  depart: string;
  arrive: string;
  from: string;
  to: string;
  duration: string;
  arriveDayOffset: number;
  stops: number;
}) {
  const { t } = useI18n();
  const plus = arriveDayOffset;
  return (
    <div className="flex items-center gap-3 py-2.5 sm:gap-4 sm:py-3">
      {/* Airline */}
      <div className="flex w-12 shrink-0 flex-col items-center text-center sm:w-14">
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-border bg-white shadow-sm">
          {airlineCode ? (
            <img
              src={`https://images.kiwi.com/airlines/64/${airlineCode}.png`}
              alt={airline}
              loading="lazy"
              className="h-7 w-7 object-contain"
              onError={(e) => {
                const img = e.currentTarget;
                img.onerror = null;
                img.style.display = "none";
                const fb = img.nextElementSibling as HTMLElement | null;
                if (fb) fb.style.display = "flex";
              }}
            />
          ) : null}
          <span
            className="h-full w-full items-center justify-center text-[10px] font-bold tracking-wider text-foreground/70"
            style={{ display: airlineCode ? "none" : "flex" }}
          >
            {airlineCode || "—"}
          </span>
        </div>
        <div className="mt-1 max-w-[3.5rem] truncate text-[10px] leading-tight text-muted-foreground">
          {airline}
        </div>
      </div>

      {/* Route — capped width so the card doesn't feel stretched */}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:max-w-md sm:gap-4">
        <div className="shrink-0">
          <div className="text-xl font-bold tabular-nums leading-none text-foreground sm:text-2xl">
            {depart}
          </div>
          <div className="mt-0.5 text-[11px] tracking-wide text-muted-foreground">{from}</div>
        </div>

        <div className="flex w-20 shrink-0 flex-col items-center sm:w-24">
          <div className="text-[11px] text-muted-foreground">{duration}</div>
          <div className="relative my-1 flex w-full items-center">
            <span className="h-px flex-1 bg-border" />
            <span className="mx-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card">
              <Plane className="h-2.5 w-2.5 -rotate-45 text-muted-foreground" />
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="text-[11px] font-medium text-rose-600">
            {stops === 0 ? t("results.direct") : `${stops} ${stops === 1 ? t("results.stop") : t("results.stops")}`}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xl font-bold tabular-nums leading-none text-foreground sm:text-2xl">
            {arrive}
            {plus > 0 && (
              <sup className="ml-0.5 align-super text-[10px] font-semibold text-foreground/70">
                +{plus}
              </sup>
            )}
          </div>
          <div className="mt-0.5 text-[11px] tracking-wide text-muted-foreground">{to}</div>
        </div>
      </div>
    </div>
  );
}

export function FlightResults({
  flights,
  selectedId,
  onSelect,
  pax = 1,
  searchMeta,
}: {
  flights: DuffelFlight[];
  selectedId: string | null;
  onSelect: (f: DuffelFlight) => void;
  pax?: number;
  searchMeta?: {
    from: string;
    to: string;
    departDate: string;
    returnDate?: string;
  } | null;
}) {
  const { t, lang } = useI18n();
  const [sortBy, setSortBy] = useState<SortKey>("cheapest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(FLIGHTS_PAGE_SIZE);

  const bounds = useFlightFilterBounds(flights);
  const hasReturn = flights.some((f) => !!f.inbound);
  const [filters, setFilters] = useState<FlightFiltersState>(() =>
    defaultFilters({ maxPrice: bounds.priceMax, maxDurationMin: bounds.durationMax }),
  );
  // Reset filter bounds whenever new flight list arrives
  useEffect(() => {
    setFilters(defaultFilters({ maxPrice: bounds.priceMax, maxDurationMin: bounds.durationMax }));
  }, [bounds.priceMax, bounds.durationMax, flights.length]);

  // Collapse list when search results or filters/sort change
  useEffect(() => {
    setVisibleCount(FLIGHTS_PAGE_SIZE);
  }, [flights, filters, sortBy]);

  const tripDurationMin = (f: DuffelFlight) =>
    f.durationMin ?? parseDurationToMin(f.duration);

  const filtered = useMemo(() => {
    return flights.filter((f) => {
      if (filters.stops === "direct" && f.stops !== 0) return false;
      if (filters.stops === "1" && f.stops !== 1) return false;
      if (filters.stops === "2+" && f.stops < 2) return false;
      if (f.price > filters.maxPrice) return false;
      if (tripDurationMin(f) > filters.maxDurationMin) return false;
      if (filters.departBuckets.length > 0 && !filters.departBuckets.includes(bucketForHour(f.outbound.depart))) return false;
      if (filters.returnBuckets.length > 0 && f.inbound && !filters.returnBuckets.includes(bucketForHour(f.inbound.depart))) return false;
      return true;
    });
  }, [flights, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === "cheapest") arr.sort((a, b) => a.price - b.price || tripDurationMin(a) - tripDurationMin(b));
    else if (sortBy === "fastest")
      arr.sort((a, b) => tripDurationMin(a) - tripDurationMin(b));
    else if (sortBy === "earliest")
      arr.sort((a, b) => a.outbound.depart.localeCompare(b.outbound.depart));
    return arr;
  }, [filtered, sortBy]);

  const visibleFlights = sorted.slice(0, visibleCount);
  const remainingCount = sorted.length - visibleFlights.length;
  const hasMore = remainingCount > 0;

  const activeCount =
    (filters.stops !== "any" ? 1 : 0) +
    (filters.maxPrice < bounds.priceMax ? 1 : 0) +
    (filters.maxDurationMin < bounds.durationMax ? 1 : 0) +
    (filters.departBuckets.length > 0 ? 1 : 0) +
    (filters.returnBuckets.length > 0 ? 1 : 0);


  const skyscannerUrl = useMemo(() => {
    if (!searchMeta) return null;
    const fmt = (d: string) => d.replace(/-/g, "").slice(2); // YYYY-MM-DD -> YYMMDD
    const seg = searchMeta.returnDate
      ? `${fmt(searchMeta.departDate)}/${fmt(searchMeta.returnDate)}`
      : `${fmt(searchMeta.departDate)}`;
    return `https://www.skyscanner.net/transport/flights/${searchMeta.from.toLowerCase()}/${searchMeta.to.toLowerCase()}/${seg}/?adults=${pax}`;
  }, [searchMeta, pax]);

  const sortLabel =
    sortBy === "cheapest"
      ? t("results.sort.cheapest")
      : sortBy === "fastest"
        ? t("results.sort.fastest")
        : t("results.sort.earliest");

  return (
    <div className="mt-8 space-y-4">
      {/* Header */}
      <div className="text-sm text-muted-foreground px-1">
        {t("results.summary")
          .replace("{n}", String(sorted.length))
          .replace("{total}", String(flights.length))}{" "}
        <span className="text-foreground font-medium">{sortLabel}</span>
      </div>

      {/* Skyscanner banner */}
      {skyscannerUrl && (
        <a
          href={skyscannerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4 text-center text-sky-700 font-semibold hover:bg-sky-100 transition-colors"
        >
          <span className="inline-flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            {t("results.openSkyscanner")}
          </span>
        </a>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="flex h-full w-full flex-col sm:max-w-md overflow-hidden">
          <SheetHeader className="text-left shrink-0">
            <SheetTitle>{t("filters.title")}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-2 pr-1">
            <FlightFilters
              embedded
              value={filters}
              onChange={setFilters}
              bounds={bounds}
              hasReturn={hasReturn}
              activeCount={activeCount}
              onReset={() =>
                setFilters(
                  defaultFilters({ maxPrice: bounds.priceMax, maxDurationMin: bounds.durationMax }),
                )
              }
            />
          </div>
          <SheetFooter className="shrink-0 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              className="w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 transition-colors"
            >
              {t("filters.apply")}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <div className="mx-auto w-full max-w-4xl space-y-3">
        {/* Sort + Filters toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-1">
          <span className="text-sm font-medium text-foreground">{t("results.sortBy")}</span>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="appearance-none rounded-lg border border-border bg-card px-4 py-2 pr-9 text-sm font-medium text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            >
              <option value="cheapest">{t("results.sort.cheapest")}</option>
              <option value="fastest">{t("results.sort.fastest")}</option>
              <option value="earliest">{t("results.sort.earliest")}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50/50",
              activeCount > 0 && "border-sky-400 bg-sky-50/60",
            )}
          >
            <SlidersHorizontal className="h-4 w-4 text-sky-600" />
            {t("filters.title")}
            {activeCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-sky-500 text-white text-[11px] font-bold h-5 min-w-5 px-1.5">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {sorted.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
            {t("results.empty")}
          </div>
        )}

        {/* Flight cards */}
        <div className="space-y-2.5">
        {visibleFlights.map((f, idx) => {
          const selected = selectedId === f.id;
          const isCheapest = idx === 0 && sortBy === "cheapest";
          const inboundRoute = resolveInboundRoute(f.outbound, f.inbound, f.tripKind);
          const returnFrom = inboundRoute?.from;
          const returnTo = inboundRoute?.to;
          return (
            <div
              key={`${f.id}-${idx}`}
              className={cn(
                "overflow-hidden rounded-xl border bg-card transition-all",
                selected
                  ? "border-sky-400 bg-sky-50/30 shadow-[0_0_0_2px_color-mix(in_oklab,#38bdf8_20%,transparent)]"
                  : "border-border hover:border-sky-300 hover:shadow-sm",
              )}
            >
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_148px]">
                {/* Left: legs */}
                <div className="divide-y divide-border px-3 sm:px-4">
                  <FlightLeg
                    airline={f.outbound.airline || f.airline}
                    airlineCode={f.outbound.airlineCode || f.airlineCode}
                    depart={f.outbound.depart}
                    arrive={f.outbound.arrive}
                    from={f.outbound.from}
                    to={f.outbound.to}
                    duration={f.outbound.duration}
                    arriveDayOffset={f.outbound.arriveDayOffset}
                    stops={f.outbound.stops}
                  />
                  {f.inbound && returnFrom && returnTo && (
                    <FlightLeg
                      airline={f.inbound.airline || f.airline}
                      airlineCode={f.inbound.airlineCode || f.airlineCode}
                      depart={f.inbound.depart}
                      arrive={f.inbound.arrive}
                      from={returnFrom}
                      to={returnTo}
                      duration={f.inbound.duration}
                      arriveDayOffset={f.inbound.arriveDayOffset}
                      stops={f.inbound.stops}
                    />
                  )}
                </div>

                {/* Right: price + CTA */}
                <div className="flex flex-col items-center justify-center gap-1.5 border-t border-border bg-muted/15 px-3 py-3 text-center lg:items-end lg:border-l lg:border-t-0 lg:text-right">
                  {isCheapest && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      {t("results.cheapestBadge")}
                    </span>
                  )}
                  <div className="text-[11px] text-muted-foreground">
                    {formatPaxUiCount(pax, lang, t("results.traveler"), t("results.travelers"))}
                  </div>
                  <div className="text-2xl font-bold tabular-nums leading-none text-foreground">
                    {f.price} €
                  </div>
                  <div className="text-[11px] text-muted-foreground">{t("results.totalPrice")}</div>
                  <a
                    href={skyscannerUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex w-full max-w-[132px] items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-600"
                  >
                    {t("results.select")} <span aria-hidden>→</span>
                  </a>
                </div>
              </div>

              {/* AI plan footer row */}
              <div className="border-t border-border bg-card px-3 py-2 sm:px-4">
                <button
                  data-select-ai-plan={idx === 0 ? "first" : undefined}
                  onClick={() => onSelect(f)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors sm:text-sm",
                    selected
                      ? "bg-sky-500 text-white"
                      : "border border-transparent text-sky-600 hover:bg-sky-50",
                  )}
                >
                  {selected ? (
                    <>
                      <Check className="h-3 w-3" /> {t("results.selectedAi")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" /> {t("results.selectAiPlan")}
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={() =>
                setVisibleCount((n) => Math.min(n + FLIGHTS_PAGE_SIZE, sorted.length))
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50/60 hover:text-sky-700"
            >
              {remainingCount <= FLIGHTS_PAGE_SIZE
                ? t("results.loadMore")
                : t("results.loadMoreCount").replace(
                    "{n}",
                    String(Math.min(FLIGHTS_PAGE_SIZE, remainingCount)),
                  )}
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );

}
