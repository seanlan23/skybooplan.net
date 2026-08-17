import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { ArrowUp, Loader2, MapPin, Plane } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import { airportTextMatchesQuery } from "@/lib/airportRank";
import { searchPlaces, type PlaceSuggestion } from "@/lib/places.functions";
import {
  formatDestinationAirportPick,
  searchDestinationAirports,
} from "@/lib/popularDestinationAirports";
import { formatStayPlacePick, mergeStaySuggestions } from "@/lib/stayPlaces";
import { cn } from "@/lib/utils";

function mergeAirportSuggestions(
  query: string,
  remote: PlaceSuggestion[],
): PlaceSuggestion[] {
  // Local country→hubs first. Do NOT require Duffel city/name to contain the
  // typed country word ("egipt" must keep Cairo/Hurghada even if city is English).
  const local = searchDestinationAirports(query, 8);
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  const trusted = new Set(local.map((s) => s.iata.toUpperCase()));
  for (const s of [...local, ...remote]) {
    const key = s.iata.toUpperCase();
    if (!/^[A-Z]{3}$/.test(key) || seen.has(key)) continue;
    if (!trusted.has(key) && !airportTextMatchesQuery(s, query)) continue;
    seen.add(key);
    out.push({ ...s, iata: key });
    if (out.length >= 10) break;
  }
  return out;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  onPick: (destination: string, label: string) => void;
  onSubmit: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  canSubmit: boolean;
  disabled?: boolean;
  placeholder: string;
  /** Stays search places (Mapbox). Flights keep airport IATA. */
  kind?: "airport" | "place";
};

/** Destination typeahead for hero “Želim drugam”. */
export function HeroDestinationAutocomplete({
  value,
  onChange,
  onPick,
  onSubmit,
  onKeyDown,
  inputRef,
  canSubmit,
  disabled,
  placeholder,
  kind = "airport",
}: Props) {
  const { t } = useI18n();
  const isPlace = kind === "place";
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [focused, setFocused] = useState(false);
  const [listMax, setListMax] = useState(220);
  const justPickedRef = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const placesFn = useServerFn(searchPlaces);
  const placesFnRef = useRef(placesFn);
  placesFnRef.current = placesFn;

  useEffect(() => {
    const q = value.trim();
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

    setSuggestions(isPlace ? mergeStaySuggestions(q, []) : mergeAirportSuggestions(q, []));
    setOpen(true);
    setHighlight(0);
    setLoading(true);

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await placesFnRef.current({
          data: { query: q, kind: isPlace ? "place" : "airport" },
        });
        if (cancelled) return;
        setSuggestions(
          isPlace
            ? mergeStaySuggestions(q, res.suggestions)
            : mergeAirportSuggestions(q, res.suggestions),
        );
        setOpen(true);
        setHighlight(0);
      } catch (err) {
        if (!cancelled) {
          console.error("Hero destination places:", err);
          setSuggestions(isPlace ? mergeStaySuggestions(q, []) : mergeAirportSuggestions(q, []));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, focused, isPlace]);

  useEffect(() => {
    localInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!focused) return;
    const update = () => {
      const vv = window.visualViewport;
      if (!vv || !boxRef.current) return;
      const rect = boxRef.current.getBoundingClientRect();
      const space = vv.height - (rect.bottom - vv.offsetTop) - 12;
      setListMax(Math.max(88, Math.min(220, Math.floor(space))));
    };
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [focused]);

  function pick(s: PlaceSuggestion) {
    const { value: dest, label } = isPlace
      ? formatStayPlacePick(s)
      : formatDestinationAirportPick(s);
    justPickedRef.current = true;
    onChange(dest);
    setSuggestions([]);
    setOpen(false);
    onPick(dest, label);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        pick(suggestions[highlight]!);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(e);
  }

  const showList = open && value.trim().length >= 2;
  const Icon = isPlace ? MapPin : Plane;

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2">
        <Icon className="h-4 w-4 shrink-0 text-sky-300" aria-hidden />
        <input
          ref={(el) => {
            localInputRef.current = el;
            if (inputRef) {
              (inputRef as { current: HTMLInputElement | null }).current = el;
            }
          }}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setFocused(true);
            if (value.trim().length >= 2) setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          aria-expanded={showList}
          className="max-h-20 min-h-[2.5rem] w-full border-0 bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-0 sm:text-[15px]"
          style={{ color: "#fff", WebkitTextFillColor: "#fff" }}
        />
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          aria-label={t("heroChat.send" as never)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white shadow-md hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      {showList ? (
        <div
          className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-white/25 bg-slate-950/95 shadow-2xl backdrop-blur-md"
          style={{ maxHeight: listMax }}
        >
          {loading && suggestions.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-white/70">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("autocomplete.searching" as never)}
            </div>
          ) : suggestions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-white/65">
              {t("autocomplete.noResults" as never).replace("{query}", value.trim())}
            </p>
          ) : (
            <ul className="overflow-y-auto py-1" style={{ maxHeight: Math.max(72, listMax - 8) }}>
              {suggestions.map((s, i) => {
                const city =
                  s.city && s.city !== s.name
                    ? s.city
                    : s.name.replace(/ Airport$/i, "");
                const title = isPlace ? s.name : city;
                const subtitle = isPlace
                  ? [t("autocomplete.type.place" as never), s.country].filter(Boolean).join(" · ")
                  : `${t("autocomplete.type.airport" as never)}${s.country ? ` · ${s.country}` : ""}`;
                return (
                  <li key={`${s.iata}-${i}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(s)}
                      onMouseEnter={() => setHighlight(i)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors",
                        i === highlight ? "bg-white/15" : "hover:bg-white/10",
                      )}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">
                          {!isPlace ? (
                            <span className="text-sky-300">{s.iata}</span>
                          ) : null}
                          <span className={!isPlace ? "ml-1.5" : undefined}>{title}</span>
                        </div>
                        <div className="text-xs text-white/55">{subtitle}</div>
                      </div>
                      {!isPlace ? (
                        <span className="mt-0.5 shrink-0 text-xs font-bold text-sky-300">
                          {s.iata}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
