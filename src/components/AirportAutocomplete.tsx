import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Loader2, MapPin, Plane, Globe, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { didYouMeanAirport, searchAirportCatalog } from "@/lib/airportCatalog";
import { searchPlaces, type PlaceSuggestion } from "@/lib/places.functions";
import { useI18n } from "@/lib/i18n";
import {
  FIELD_ICON,
  FIELD_ICON_SLOT,
  FIELD_INPUT,
  FIELD_LABEL,
  FIELD_SHELL,
  FIELD_VALUE_ROW,
} from "@/components/searchFieldStyles";

function mergeLocalRemote(
  query: string,
  remote: PlaceSuggestion[],
): PlaceSuggestion[] {
  const local = searchAirportCatalog(query, 8);
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const s of [...local, ...remote]) {
    const key = s.iata.toUpperCase();
    if (!/^[A-Z]{3}$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, iata: key });
    if (out.length >= 12) break;
  }
  return out;
}

type Kind = "airport" | "place";

export function AirportAutocomplete({
  label,
  placeholder,
  value,
  onChange,
  kind = "airport",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  /** "airport" -> emits IATA code; "place" -> emits "City, Country" / "Name, Country" text */
  kind?: Kind;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const justPickedRef = useRef(false);
  const selectedRef = useRef<{ value: string; display: string } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const placesFn = useServerFn(searchPlaces);
  const placesFnRef = useRef(placesFn);
  placesFnRef.current = placesFn;
  const visibleSuggestions =
    kind === "place"
      ? suggestions.filter((suggestion) => suggestion.type === "city")
      : suggestions;

  // Sync external value (e.g. swap, history repeat)
  useEffect(() => {
    if (selectedRef.current && value === selectedRef.current.value) {
      setQuery(selectedRef.current.display);
      return;
    }

    selectedRef.current = null;
    setQuery(value);
  }, [value]);

  // Debounced fetch — only while the field is focused (avoids auto-open on page load).
  useEffect(() => {
    const q = query.trim();
    if (!focused || q.length < 2) {
      if (q.length < 2) {
        setSuggestions([]);
        setLoading(false);
      }
      return;
    }
    if (justPickedRef.current) {
      justPickedRef.current = false;
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    // Instant local fuzzy hits while Duffel loads.
    if (kind === "airport") {
      setSuggestions(mergeLocalRemote(q, []));
      setOpen(true);
    }

    const t = setTimeout(async () => {
      try {
        const res = await placesFnRef.current({ data: { query: q, kind } });
        if (cancelled) return;
        setSuggestions(
          kind === "airport"
            ? mergeLocalRemote(q, res.suggestions)
            : res.suggestions,
        );
        setOpen(true);
        setHighlight(0);
        if (res.error) console.warn("Places:", res.error);
      } catch (e) {
        if (cancelled) return;
        console.error("Places fetch error:", e);
        if (kind === "airport") {
          setSuggestions(mergeLocalRemote(q, []));
        } else {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, kind, focused]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function formatPick(s: PlaceSuggestion): string {
    if (kind === "airport") return s.iata;
    // place: prefer "City, Country" for cities; "Name, Country" for airports
    const base = s.type === "city" ? (s.city || s.name) : s.name;
    return s.country ? `${base}, ${s.country}` : base;
  }

  function formatDisplay(s: PlaceSuggestion): string {
    if (kind === "airport") {
      const place = s.city && s.city !== s.name ? s.city : s.name.replace(/ Airport$/i, "");
      const cc = s.country ? `, ${s.country}` : "";
      return `${s.iata} — ${place}${cc}`;
    }
    return formatPick(s);
  }

  function pick(s: PlaceSuggestion) {
    const out = formatPick(s);
    const display = formatDisplay(s);
    justPickedRef.current = true;
    selectedRef.current = { value: out, display };
    onChange(out);
    setQuery(display);
    setSuggestions([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || visibleSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, visibleSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(visibleSuggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative h-full min-w-0" ref={boxRef}>
      <div className={cn("relative h-full", FIELD_SHELL)}>
        <div className={FIELD_LABEL}>{label}</div>
        <div className={cn(FIELD_VALUE_ROW, "relative pr-7")}>
          <div className={FIELD_ICON_SLOT}>
            {kind === "airport" ? (
              <Plane className={FIELD_ICON} />
            ) : (
              <MapPin className={FIELD_ICON} />
            )}
          </div>
          <input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              selectedRef.current = null;
              setQuery(v);
              if (v.trim().length >= 2) setOpen(true);
              if (kind === "place") onChange(v);
            }}
            onFocus={() => {
              setFocused(true);
              if (query.trim().length >= 2) setOpen(true);
            }}
            onBlur={() => {
              setFocused(false);
              setOpen(false);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            className={FIELD_INPUT}
          />
          {query && (
            <button
              type="button"
              aria-label={t("common.clear")}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                selectedRef.current = null;
                setQuery("");
                onChange("");
                setSuggestions([]);
                setOpen(false);
              }}
              className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-30 mt-2 w-full min-w-[280px] rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("autocomplete.searching")}
            </div>
          ) : visibleSuggestions.length === 0 ? (
            <EmptyAirportResults
              query={query}
              kind={kind}
              noResultsLabel={t("autocomplete.noResults")}
              didYouMeanLabel={t("autocomplete.didYouMean")}
              onPick={pick}
            />
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {visibleSuggestions.map((s, i) => (
                <li key={`${s.iata}-${i}`}>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-2.5 transition-colors ${
                      i === highlight ? "bg-muted" : "hover:bg-muted/60"
                    }`}
                  >
                    {s.type === "city" ? (
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    ) : (
                      <Plane className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {kind === "airport" ? (
                          <>
                            <span className="text-blue-600">{s.iata}</span>
                            <span className="ml-1.5">
                              {s.city && s.city !== s.name ? s.city : s.name.replace(/ Airport$/i, "")}
                            </span>
                          </>
                        ) : (
                          <>
                            {s.name}
                            {s.city && s.city !== s.name && (
                              <span className="ml-1 font-normal text-muted-foreground">· {s.city}</span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        {s.type === "city" ? t("autocomplete.type.city") : t("autocomplete.type.airport")}
                        {s.country ? (
                          <>
                            <span>·</span>
                            <Globe className="h-3 w-3" />
                            <span>{s.country}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {kind === "airport" && (
                      <span className="mt-0.5 shrink-0 text-xs font-bold text-blue-600">{s.iata}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyAirportResults({
  query,
  kind,
  noResultsLabel,
  didYouMeanLabel,
  onPick,
}: {
  query: string;
  kind: Kind;
  noResultsLabel: string;
  didYouMeanLabel: string;
  onPick: (s: PlaceSuggestion) => void;
}) {
  const hint = kind === "airport" ? didYouMeanAirport(query) : null;
  return (
    <div className="space-y-2 px-4 py-3 text-sm text-muted-foreground">
      <p>{noResultsLabel.replace("{query}", query)}</p>
      {hint ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(hint)}
          className="rounded-lg bg-muted px-2.5 py-1.5 text-left text-sm font-medium text-foreground hover:bg-muted/80"
        >
          {didYouMeanLabel.replace("{airport}", `${hint.city} (${hint.iata})`)}
        </button>
      ) : null}
    </div>
  );
}
