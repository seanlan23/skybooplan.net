import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Plane, Search, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useI18n } from "@/lib/i18n";
import {
  didYouMeanAirport,
  formatOriginSelection,
  getAirportHub,
  localizedAirportCity,
  type AirportHub,
} from "@/lib/airportCatalog";
import { suggestOriginHubs } from "@/lib/originGeo.functions";
import { DEFAULT_ORIGIN_IATAS } from "@/lib/originHubsByGeo";
import { searchDestinationAirports } from "@/lib/popularDestinationAirports";
import { readRecentOrigins } from "@/lib/recentOrigins";
import { searchPlaces, type PlaceSuggestion } from "@/lib/places.functions";
import { cn } from "@/lib/utils";

type Phase = "pickCity" | "other" | "nearby";

type OriginAirportPickerProps = {
  onConfirm: (iatas: string[], label: string) => void;
  /** Destination IATA — never offer / confirm this as departure. */
  excludeIata?: string | null;
  className?: string;
};

/** Sensible “also check these” companions per home airport. */
const NEARBY_BY_HOME: Record<string, string[]> = {
  LJU: ["VIE", "ZAG", "TRS"],
  VIE: ["LJU", "BUD", "MUC"],
  ZAG: ["LJU", "VIE", "TRS"],
  MXP: ["VCE", "VIE", "ZRH"],
  BUD: ["VIE", "LJU", "ZAG"],
  MUC: ["FRA", "VIE", "ZRH"],
  FRA: ["MUC", "DUS", "CGN"],
  HAM: ["BER", "FRA", "DUS"],
  BER: ["HAM", "FRA", "MUC"],
  DUS: ["CGN", "FRA", "AMS"],
  CGN: ["DUS", "FRA", "BRU"],
  ZRH: ["MUC", "FRA", "BSL"],
  GVA: ["ZRH", "LYS", "MXP"],
  BSL: ["ZRH", "FRA", "GVA"],
  VCE: ["MXP", "LJU", "TRS"],
  TRS: ["LJU", "VCE", "VIE"],
  CDG: ["ORY", "BRU", "AMS"],
  LHR: ["LGW", "MAN", "AMS"],
  AMS: ["BRU", "DUS", "CGN"],
  PRG: ["VIE", "MUC", "BER"],
  WAW: ["KRK", "BER", "VIE"],
};

function hubsFromIatas(iatas: readonly string[]): AirportHub[] {
  const out: AirportHub[] = [];
  const seen = new Set<string>();
  for (const code of [...iatas, ...DEFAULT_ORIGIN_IATAS]) {
    const hub = getAirportHub(code);
    if (!hub || seen.has(hub.iata)) continue;
    seen.add(hub.iata);
    out.push(hub);
    if (out.length >= 6) break;
  }
  return out;
}

function mergeSuggestions(
  local: PlaceSuggestion[],
  remote: PlaceSuggestion[],
): PlaceSuggestion[] {
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const s of [...local, ...remote]) {
    const key = s.iata.toUpperCase();
    if (!/^[A-Z]{3}$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, iata: key });
    if (out.length >= 8) break;
  }
  return out;
}

function cityButtonLabel(hub: AirportHub, lang: string): string {
  return localizedAirportCity(hub, lang);
}

export function OriginAirportPicker({
  onConfirm,
  excludeIata = null,
  className,
}: OriginAirportPickerProps) {
  const { t, lang } = useI18n();
  const placesFn = useServerFn(searchPlaces);
  const placesFnRef = useRef(placesFn);
  placesFnRef.current = placesFn;
  const suggestOriginsFn = useServerFn(suggestOriginHubs);
  const blocked = (excludeIata ?? "").trim().toUpperCase() || null;

  const [phase, setPhase] = useState<Phase>("pickCity");
  const [home, setHome] = useState<string | null>(null);
  const [homeCityLabel, setHomeCityLabel] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [primaryIatas, setPrimaryIatas] = useState<string[]>([...DEFAULT_ORIGIN_IATAS]);

  useEffect(() => {
    setRecent(readRecentOrigins());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await suggestOriginsFn();
        if (cancelled || !res?.iatas?.length) return;
        setPrimaryIatas(res.iatas);
      } catch (err) {
        console.warn("Origin geo suggest failed — using default hubs", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [suggestOriginsFn]);

  const primaryHubs = useMemo(
    () => hubsFromIatas(primaryIatas).filter((h) => !blocked || h.iata !== blocked),
    [primaryIatas, blocked],
  );

  const recentHubs = useMemo(() => {
    const primarySet = new Set(primaryIatas);
    return recent
      .filter((code) => !primarySet.has(code) && (!blocked || code !== blocked))
      .map((code) => getAirportHub(code))
      .filter((h): h is AirportHub => Boolean(h))
      .slice(0, 3);
  }, [recent, primaryIatas, blocked]);

  const nearbyHubs = useMemo(() => {
    if (!home) return [];
    return (NEARBY_BY_HOME[home] ?? [])
      .map((code) => getAirportHub(code))
      .filter((h): h is AirportHub => Boolean(h) && (!blocked || h.iata !== blocked));
  }, [home, blocked]);

  // Popular + hub catalog — Barcelona/Manila show instantly (not only after Duffel).
  const localHits = useMemo(
    () =>
      (query.trim().length >= 2 ? searchDestinationAirports(query, 8) : []).filter(
        (s) => !blocked || s.iata.toUpperCase() !== blocked,
      ),
    [query, blocked],
  );

  const didYouMean = useMemo(() => {
    if (query.trim().length < 2 || localHits.length > 0) return null;
    return didYouMeanAirport(query);
  }, [query, localHits]);

  useEffect(() => {
    if (phase !== "other") return;
    const q = query.trim();
    if (q.length < 2) {
      setRemote([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await placesFnRef.current({ data: { query: q, kind: "airport" } });
        if (!cancelled) setRemote(res.suggestions ?? []);
      } catch {
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, phase]);

  const suggestions = useMemo(
    () =>
      mergeSuggestions(localHits, remote).filter(
        (s) => !blocked || s.iata.toUpperCase() !== blocked,
      ),
    [localHits, remote, blocked],
  );

  function cityLabelForIata(iata: string, fallback?: string): string {
    const hub = getAirportHub(iata);
    if (hub) return cityButtonLabel(hub, lang);
    if (home === iata && homeCityLabel) return homeCityLabel;
    return fallback?.trim() || iata;
  }

  function finish(iatas: string[], labelOverride?: string) {
    const unique = [...new Set(iatas.map((c) => c.toUpperCase()))].filter(
      (c) => /^[A-Z]{3}$/.test(c) && (!blocked || c !== blocked),
    );
    if (unique.length === 0) return;
    const label =
      labelOverride?.trim() ||
      unique.map((code) => `${cityLabelForIata(code)} (${code})`).join(" · ");
    onConfirm(unique, label || formatOriginSelection(unique));
  }

  function chooseHome(iata: string, cityName?: string) {
    const code = iata.toUpperCase();
    if (blocked && code === blocked) return;
    setHome(code);
    setHomeCityLabel(cityName?.trim() || cityLabelForIata(code) || null);
    setExtra([]);
    setQuery("");
    // Unknown hubs (e.g. BCN): confirm immediately — no empty “nearby” step.
    if (!(NEARBY_BY_HOME[code]?.length)) {
      const city = cityName?.trim() || cityLabelForIata(code);
      finish([code], `${city} (${code})`);
      return;
    }
    setPhase("nearby");
  }

  function pickSuggestion(s: PlaceSuggestion) {
    const city = s.city || s.name.replace(/ Airport$/i, "");
    chooseHome(s.iata, city);
  }

  function confirmJustHome() {
    if (!home) return;
    finish([home], `${cityLabelForIata(home)} (${home})`);
  }

  function confirmWithNearby() {
    if (!home) return;
    const codes = [home, ...extra];
    finish(
      codes,
      codes.map((code) => `${cityLabelForIata(code)} (${code})`).join(" · "),
    );
  }

  function toggleExtra(iata: string) {
    const code = iata.toUpperCase();
    setExtra((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code].slice(0, 4),
    );
  }

  return (
    <div
      className={cn(
        "hero-sky-enter w-full max-w-md rounded-2xl border border-white/25 bg-white/12 p-4 shadow-lg backdrop-blur-md sm:p-5",
        className,
      )}
    >
      {phase === "pickCity" ? (
        <>
          <p className="text-base font-semibold text-white">
            {t("heroChat.origin.guidedTitle" as never)}
          </p>
          <p className="mt-1 text-sm text-white/70">
            {t("heroChat.origin.guidedHint" as never)}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {primaryHubs.map((hub) => (
              <button
                key={hub.iata}
                type="button"
                onClick={() => chooseHome(hub.iata)}
                className="rounded-2xl border border-white/25 bg-white/15 px-3 py-3.5 text-center text-[15px] font-semibold text-white shadow-sm transition hover:bg-white/25 active:scale-[0.98]"
              >
                {cityButtonLabel(hub, lang)}
              </button>
            ))}
          </div>

          {recentHubs.length > 0 ? (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-white/50">
                {t("heroChat.origin.recent" as never)}
              </p>
              <div className="flex flex-wrap gap-2">
                {recentHubs.map((hub) => (
                  <button
                    key={hub.iata}
                    type="button"
                    onClick={() => chooseHome(hub.iata)}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white/90 hover:bg-white/20"
                  >
                    {cityButtonLabel(hub, lang)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setPhase("other");
              setQuery("");
            }}
            className="mt-4 w-full rounded-xl border border-dashed border-white/30 bg-transparent py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"
          >
            {t("heroChat.origin.otherCity" as never)}
          </button>
        </>
      ) : null}

      {phase === "other" ? (
        <>
          <button
            type="button"
            onClick={() => {
              setPhase("pickCity");
              setQuery("");
            }}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/75 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("heroChat.origin.back" as never)}
          </button>
          <p className="text-base font-semibold text-white">
            {t("heroChat.origin.otherTitle" as never)}
          </p>
          <p className="mt-1 text-sm text-white/70">
            {t("heroChat.origin.otherHint" as never)}
          </p>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("heroChat.origin.searchPlaceholder" as never)}
              autoComplete="off"
              autoFocus
              className="w-full rounded-xl border border-white/20 bg-white/10 py-3 pl-9 pr-9 text-base text-white placeholder:text-white/45 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            />
            {query ? (
              <button
                type="button"
                aria-label={t("common.clear" as never)}
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/60 hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-white/15 bg-black/25">
            {query.trim().length < 2 ? (
              <p className="px-3 py-3 text-sm text-white/55">
                {t("heroChat.origin.typeCity" as never)}
              </p>
            ) : loading && suggestions.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("autocomplete.searching")}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="space-y-2 px-3 py-3 text-sm text-white/75">
                <p>{t("autocomplete.noResults").replace("{query}", query.trim())}</p>
                {didYouMean ? (
                  <button
                    type="button"
                    onClick={() =>
                      pickSuggestion({
                        ...didYouMean,
                        city: didYouMean.city || didYouMean.name,
                      })
                    }
                    className="rounded-lg bg-white/15 px-3 py-2 font-medium text-white hover:bg-white/25"
                  >
                    {t("heroChat.origin.didYouMean" as never).replace(
                      "{airport}",
                      `${didYouMean.city} (${didYouMean.iata})`,
                    )}
                  </button>
                ) : null}
              </div>
            ) : (
              <ul>
                {suggestions.map((s) => {
                  const city = s.city || s.name.replace(/ Airport$/i, "");
                  return (
                    <li key={s.iata}>
                      <button
                        type="button"
                        onClick={() => pickSuggestion(s)}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/10"
                      >
                        <Plane className="h-4 w-4 shrink-0 text-sky-300" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-white">
                            <span className="text-sky-300">{s.iata}</span>
                            <span className="ml-1.5">{city}</span>
                          </span>
                          <span className="block text-xs text-white/55">
                            {t("autocomplete.type.airport")}
                            {s.country ? ` · ${s.country}` : ""}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}

      {phase === "nearby" && home ? (
        <>
          <button
            type="button"
            onClick={() => {
              setPhase("pickCity");
              setHome(null);
              setExtra([]);
            }}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-white/75 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("heroChat.origin.back" as never)}
          </button>

          <p className="text-base font-semibold text-white">
            {t("heroChat.origin.nearbyTitle" as never).replace(
              "{city}",
              cityLabelForIata(home),
            )}
          </p>
          <p className="mt-1 text-sm text-white/70">
            {t("heroChat.origin.nearbyHint" as never)}
          </p>

          <button
            type="button"
            onClick={confirmJustHome}
            className="mt-4 w-full rounded-2xl bg-sky-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-md hover:bg-sky-400"
          >
            {t("heroChat.origin.justThis" as never).replace(
              "{city}",
              cityLabelForIata(home),
            )}
          </button>

          {nearbyHubs.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-white/15 bg-black/15 p-3">
              <p className="text-sm font-medium text-white/90">
                {t("heroChat.origin.alsoNearby" as never)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {nearbyHubs.map((hub) => {
                  const on = extra.includes(hub.iata);
                  return (
                    <button
                      key={hub.iata}
                      type="button"
                      onClick={() => toggleExtra(hub.iata)}
                      className={cn(
                        "rounded-full border px-3 py-2 text-sm font-medium transition",
                        on
                          ? "border-sky-300 bg-sky-500 text-white"
                          : "border-white/25 bg-white/10 text-white/90 hover:bg-white/18",
                      )}
                    >
                      {on ? "✓ " : "+ "}
                      {cityButtonLabel(hub, lang)}
                    </button>
                  );
                })}
              </div>
              {extra.length > 0 ? (
                <button
                  type="button"
                  onClick={confirmWithNearby}
                  className="mt-3 w-full rounded-xl bg-white/20 py-2.5 text-sm font-semibold text-white hover:bg-white/30"
                >
                  {t("heroChat.origin.compareSelected" as never).replace(
                    "{count}",
                    String(1 + extra.length),
                  )}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-center text-xs text-white/45">
              {t("heroChat.origin.orContinue" as never)}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}
