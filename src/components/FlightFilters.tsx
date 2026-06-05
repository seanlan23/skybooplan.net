import { useMemo } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export type StopsFilter = "any" | "direct" | "1" | "2+";
export type TimeBucket = "early" | "morning" | "afternoon" | "evening";

export type FlightFiltersState = {
  stops: StopsFilter;
  maxPrice: number;
  maxDurationMin: number;
  departBuckets: TimeBucket[];
  returnBuckets: TimeBucket[];
};

export function defaultFilters(opts: {
  maxPrice: number;
  maxDurationMin: number;
}): FlightFiltersState {
  return {
    stops: "any",
    maxPrice: opts.maxPrice,
    maxDurationMin: opts.maxDurationMin,
    departBuckets: [],
    returnBuckets: [],
  };
}

export function bucketForHour(hhmm: string): TimeBucket {
  const h = parseInt(hhmm.slice(0, 2), 10);
  if (h < 6) return "early";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

const BUCKETS: { id: TimeBucket; labelKey: string; range: string }[] = [
  { id: "early", labelKey: "filters.bucket.early", range: "00–06" },
  { id: "morning", labelKey: "filters.bucket.morning", range: "06–12" },
  { id: "afternoon", labelKey: "filters.bucket.afternoon", range: "12–18" },
  { id: "evening", labelKey: "filters.bucket.evening", range: "18–24" },
];

const STOPS: { id: StopsFilter; labelKey: string }[] = [
  { id: "any", labelKey: "filters.stops.any" },
  { id: "direct", labelKey: "filters.stops.direct" },
  { id: "1", labelKey: "filters.stops.one" },
  { id: "2+", labelKey: "filters.stops.twoPlus" },
];

function fmtDuration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function FlightFilters({
  value,
  onChange,
  bounds,
  hasReturn,
  activeCount,
  onReset,
  embedded = false,
}: {
  value: FlightFiltersState;
  onChange: (next: FlightFiltersState) => void;
  bounds: { priceMin: number; priceMax: number; durationMin: number; durationMax: number };
  hasReturn: boolean;
  activeCount: number;
  onReset: () => void;
  /** When true (inside sheet/modal), skip outer card chrome. */
  embedded?: boolean;
}) {
  const { t } = useI18n();
  const update = <K extends keyof FlightFiltersState>(k: K, v: FlightFiltersState[K]) =>
    onChange({ ...value, [k]: v });

  const toggleBucket = (key: "departBuckets" | "returnBuckets", b: TimeBucket) => {
    const arr = value[key];
    update(key, arr.includes(b) ? arr.filter((x) => x !== b) : [...arr, b]);
  };

  const priceStep = Math.max(1, Math.round((bounds.priceMax - bounds.priceMin) / 50) || 1);
  const durStep = 15;

  return (
    <div
      className={cn(
        "space-y-5",
        embedded ? "p-0" : "rounded-2xl border border-border bg-card p-4 sm:p-5",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-foreground font-semibold">
          <SlidersHorizontal className="h-4 w-4 text-sky-600" />
          {t("filters.title")}
          {activeCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-sky-500 text-white text-[11px] font-bold h-5 min-w-5 px-1.5">
              {activeCount}
            </span>
          )}
        </div>
        {activeCount > 0 && (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700"
          >
            <X className="h-3.5 w-3.5" /> {t("filters.reset")}
          </button>
        )}
      </div>

      {/* Stops */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          {t("filters.stops")}
        </div>
        <div className="flex flex-wrap gap-2">
          {STOPS.map((s) => {
            const active = value.stops === s.id;
            return (
              <button
                key={s.id}
                onClick={() => update("stops", s.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  active
                    ? "bg-sky-500 text-white border-sky-500"
                    : "bg-card text-foreground border-border hover:border-sky-300",
                )}
              >
                {t(s.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Max price */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("filters.maxPrice")}
          </div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {t("filters.upTo")} {Math.round(value.maxPrice)} €
          </div>
        </div>
        <input
          type="range"
          min={bounds.priceMin}
          max={bounds.priceMax}
          step={priceStep}
          value={value.maxPrice}
          onChange={(e) => update("maxPrice", Number(e.target.value))}
          className="w-full accent-sky-500"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground mt-1 tabular-nums">
          <span>{bounds.priceMin} €</span>
          <span>{bounds.priceMax} €</span>
        </div>
      </div>

      {/* Max duration */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t("filters.maxDuration")}
          </div>
          <div className="text-sm font-semibold text-foreground tabular-nums">
            {t("filters.upTo")} {fmtDuration(value.maxDurationMin)}
          </div>
        </div>
        <input
          type="range"
          min={bounds.durationMin}
          max={bounds.durationMax}
          step={durStep}
          value={value.maxDurationMin}
          onChange={(e) => update("maxDurationMin", Number(e.target.value))}
          className="w-full accent-sky-500"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground mt-1">
          <span>{fmtDuration(bounds.durationMin)}</span>
          <span>{fmtDuration(bounds.durationMax)}</span>
        </div>
      </div>

      {/* Outbound time */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          {t("filters.outbound")}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {BUCKETS.map((b) => {
            const active = value.departBuckets.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggleBucket("departBuckets", b.id)}
                className={cn(
                  "flex flex-col items-center justify-center px-3 py-2 rounded-xl border text-sm transition-colors",
                  active
                    ? "bg-sky-50 border-sky-400 text-sky-700"
                    : "bg-card border-border text-foreground hover:border-sky-300",
                )}
              >
                <span className="font-semibold">{t(b.labelKey)}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">{b.range}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Return time */}
      {hasReturn && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t("filters.return")}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BUCKETS.map((b) => {
              const active = value.returnBuckets.includes(b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => toggleBucket("returnBuckets", b.id)}
                  className={cn(
                    "flex flex-col items-center justify-center px-3 py-2 rounded-xl border text-sm transition-colors",
                    active
                      ? "bg-sky-50 border-sky-400 text-sky-700"
                      : "bg-card border-border text-foreground hover:border-sky-300",
                  )}
                >
                  <span className="font-semibold">{t(b.labelKey)}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{b.range}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function useFlightFilterBounds(
  flights: { price: number; duration: string; durationMin?: number }[],
) {
  return useMemo(() => {
    if (flights.length === 0) {
      return { priceMin: 0, priceMax: 1000, durationMin: 0, durationMax: 1440 };
    }
    const prices = flights.map((f) => f.price);
    const durations = flights.map((f) => f.durationMin ?? parseDur(f.duration));
    let priceMin = Math.floor(Math.min(...prices));
    let priceMax = Math.ceil(Math.max(...prices));
    let durationMin = Math.min(...durations);
    let durationMax = Math.max(...durations);

    // Keep sliders usable when all offers share the same price or duration.
    if (priceMax <= priceMin) priceMax = priceMin + 1;
    if (durationMax <= durationMin) durationMax = durationMin + 15;

    return { priceMin, priceMax, durationMin, durationMax };
  }, [flights]);
}

function parseDur(s: string): number {
  const d = /(\d+)\s*d/.exec(s);
  const h = /(\d+)\s*h/.exec(s);
  const m = /(\d+)\s*m/.exec(s);
  return (d ? +d[1] * 1440 : 0) + (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
}
