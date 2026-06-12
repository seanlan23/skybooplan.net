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
    <div className="grid grid-cols-[110px_1fr] sm:grid-cols-[140px_1fr] gap-3 sm:gap-5 items-center py-4">
      {/* Airline */}
      <div className="flex flex-col items-center text-center">
        <div className="h-10 w-10 rounded-md bg-white border border-border flex items-center justify-center overflow-hidden shadow-sm">
          {airlineCode ? (
            <img
              src={`https://images.kiwi.com/airlines/64/${airlineCode}.png`}
              alt={airline}
              loading="lazy"
              className="h-9 w-9 object-contain"
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
            className="h-full w-full items-center justify-center text-[11px] font-bold text-foreground/70 tracking-wider"
            style={{ display: airlineCode ? "none" : "flex" }}
          >
            {airlineCode || "—"}
          </span>
        </div>
        <div className="mt-1.5 text-[11px] text-muted-foreground leading-tight">
          {airline}
        </div>
      </div>

      {/* Times row */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-5">
        <div className="text-left">
          <div className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums leading-none">
            {depart}
          </div>
          <div className="mt-1 text-xs text-muted-foreground tracking-wider">{from}</div>
        </div>

        <div className="flex flex-col items-center min-w-0">
          <div className="text-xs text-muted-foreground mb-1">{duration}</div>
          <div className="relative w-full flex items-center">
            <span className="h-px flex-1 bg-border" />
            <span className="mx-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card">
              <Plane className="h-3 w-3 text-muted-foreground -rotate-45" />
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="mt-1 text-xs font-medium text-rose-600">
            {stops === 0 ? t("results.direct") : `${stops} ${stops === 1 ? t("results.stop") : t("results.stops")}`}
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums leading-none">
            {arrive}
            {plus > 0 && (
              <sup className="ml-0.5 text-xs font-semibold align-super text-foreground/70">
                +{plus}
              </sup>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground tracking-wider">{to}</div>
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
  const { t } = useI18n();
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

      <div className="w-full max-w-none space-y-3">
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

        {/* Full-width flight cards */}
        <div className="space-y-3 w-full">
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
                "rounded-2xl border bg-card transition-all overflow-hidden",
                selected
                  ? "border-sky-400 shadow-[0_0_0_3px_color-mix(in_oklab,#38bdf8_25%,transparent)] bg-sky-50/30"
                  : "border-border hover:border-sky-300 hover:shadow-sm",
              )}
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px]">
                {/* Left: legs */}
                <div className="px-4 sm:px-6 divide-y divide-border">
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
                <div className="border-t lg:border-t-0 lg:border-l border-border bg-muted/20 px-5 py-5 flex flex-col items-center lg:items-end justify-center gap-2 text-right">
                  {isCheapest && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold px-2.5 py-0.5">
                      {t("results.cheapestBadge")}
                    </span>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {pax} {pax === 1 ? t("results.traveler") : t("results.travelers")}
                  </div>
                  <div className="text-3xl font-bold text-foreground tabular-nums leading-none">
                    {f.price} €
                  </div>
                  <div className="text-xs text-muted-foreground">{t("results.totalPrice")}</div>
                  <a
                    href={skyscannerUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm px-6 py-2.5 transition-colors w-full max-w-[180px]"
                  >
                    {t("results.select")} <span aria-hidden>→</span>
                  </a>
                </div>
              </div>

              {/* AI plan footer row */}
              <div className="border-t border-border bg-card px-4 sm:px-6 py-2.5">
                <button
                  data-select-ai-plan={idx === 0 ? "first" : undefined}
                  onClick={() => onSelect(f)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full text-sm font-semibold px-4 py-1.5 transition-colors",
                    selected
                      ? "bg-sky-500 text-white"
                      : "text-sky-600 hover:bg-sky-50 border border-transparent",
                  )}
                >
                  {selected ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> {t("results.selectedAi")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" /> {t("results.selectAiPlan")}
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
