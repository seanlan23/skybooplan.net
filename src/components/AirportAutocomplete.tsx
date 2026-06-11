import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Plane, Globe, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { searchPlaces, type PlaceSuggestion } from "@/lib/places.functions";
import { useI18n } from "@/lib/i18n";

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

  // Debounced fetch
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    if (justPickedRef.current) {
      justPickedRef.current = false;
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await placesFnRef.current({ data: { query: q, kind } });
        if (cancelled) return;
        setSuggestions(res.suggestions);
        setOpen(true);
        setHighlight(0);
        if (res.error) console.warn("Places:", res.error);
      } catch (e) {
        if (cancelled) return;
        console.error("Places fetch error:", e);
        setSuggestions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, kind]);

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
    <div className="relative" ref={boxRef}>
      <div className="relative rounded-2xl border border-border bg-background/60 px-4 py-3 hover:border-brand/40 transition-colors focus-within:border-brand focus-within:bg-card">
        <div className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">{label}</div>
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            const raw = e.target.value;
            const v = kind === "airport" ? raw.toUpperCase() : raw;
            selectedRef.current = null;
            setQuery(v);
            setOpen(true);
            if (kind === "place") onChange(v);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          className="mt-1 w-full bg-transparent text-[15px] font-medium text-foreground placeholder:text-muted-foreground/60 focus:outline-none pr-7"
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
            className="absolute top-2 right-2 h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-30 mt-2 w-full min-w-[280px] rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("autocomplete.searching")}
            </div>
          ) : visibleSuggestions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {t("autocomplete.noResults").replace("{query}", query)}
            </div>
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
                      <MapPin className="h-4 w-4 mt-0.5 text-brand shrink-0" />
                    ) : (
                      <Plane className="h-4 w-4 mt-0.5 text-brand shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-foreground truncate">
                        {kind === "airport" ? (
                          <>
                            <span className="text-brand">{s.iata}</span>
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
                      <span className="text-xs font-bold text-brand shrink-0 mt-0.5">{s.iata}</span>
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
