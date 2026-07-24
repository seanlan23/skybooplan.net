import { useMemo, useState } from "react";
import { ArrowLeftRight, ArrowRight, CalendarDays, Minus, Plus, Users } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { AirportAutocomplete } from "@/components/AirportAutocomplete";
import { HeroDateRangeCalendar } from "@/components/HeroDateRangeCalendar";
import { useI18n } from "@/lib/i18n";
import type { HeroChatCollected } from "@/lib/heroChatFlow";
import {
  dateToIsoLocal,
  formatHeroDateRangeLabel,
  isoToLocalDate,
} from "@/lib/heroDateRange";
import {
  MIN_MOTORHOME_INTERESTS,
  MOTORHOME_INTEREST_KEYS,
  type MotorhomeInterestKey,
} from "@/lib/plannerInterests";
import { SEARCH_PRIMARY_BTN } from "@/components/searchFieldStyles";
import { cn } from "@/lib/utils";

function formatIsoField(iso: string, lang: string): string {
  const d = isoToLocalDate(iso);
  if (!d) return iso;
  const locale = lang.startsWith("sl")
    ? "sl-SI"
    : lang.startsWith("de")
      ? "de-DE"
      : lang.startsWith("fr")
        ? "fr-FR"
        : lang.startsWith("it")
          ? "it-IT"
          : lang.startsWith("es")
            ? "es-ES"
            : "en-GB";
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function defaultDepartIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 21);
  return d.toISOString().slice(0, 10);
}

function defaultReturnIso(depart: string): string {
  const d = new Date(`${depart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 10);
  return d.toISOString().slice(0, 10);
}

function passengersLabel(adults: number, children: number, lang: string): string {
  if (lang.startsWith("sl")) {
    const a = adults === 1 ? "1 odrasli" : `${adults} odrasli`;
    if (children <= 0) return a;
    const c = children === 1 ? "1 otrok" : `${children} otrok`;
    return `${a}, ${c}`;
  }
  if (lang.startsWith("de")) {
    const a = adults === 1 ? "1 Erwachsener" : `${adults} Erwachsene`;
    if (children <= 0) return a;
    const c = children === 1 ? "1 Kind" : `${children} Kinder`;
    return `${a}, ${c}`;
  }
  if (lang.startsWith("fr")) {
    const a = adults === 1 ? "1 adulte" : `${adults} adultes`;
    if (children <= 0) return a;
    const c = children === 1 ? "1 enfant" : `${children} enfants`;
    return `${a}, ${c}`;
  }
  if (lang.startsWith("it")) {
    const a = adults === 1 ? "1 adulto" : `${adults} adulti`;
    if (children <= 0) return a;
    const c = children === 1 ? "1 bambino" : `${children} bambini`;
    return `${a}, ${c}`;
  }
  if (lang.startsWith("es")) {
    const a = adults === 1 ? "1 adulto" : `${adults} adultos`;
    if (children <= 0) return a;
    const c = children === 1 ? "1 niño" : `${children} niños`;
    return `${a}, ${c}`;
  }
  const a = adults === 1 ? "1 adult" : `${adults} adults`;
  if (children <= 0) return a;
  const c = children === 1 ? "1 child" : `${children} children`;
  return `${a}, ${c}`;
}

export type MotorhomeSearchBrowserProps = {
  disabled?: boolean;
  onSubmit: (collected: HeroChatCollected) => void;
};

/** Skyscanner-style motorhome search: From → To · dates · travelers · priorities · Search. */
export function MotorhomeSearchBrowser({ disabled, onSubmit }: MotorhomeSearchBrowserProps) {
  const { t, lang } = useI18n();
  const [from, setFrom] = useState("Vienna");
  const [to, setTo] = useState("Croatia");
  const [depart, setDepart] = useState(defaultDepartIso);
  const [ret, setRet] = useState(() => defaultReturnIso(defaultDepartIso()));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [priorities, setPriorities] = useState<MotorhomeInterestKey[]>([]);
  const [showCalendar, setShowCalendar] = useState(false);

  const initialRange = useMemo<DateRange | undefined>(() => {
    const fromD = isoToLocalDate(depart);
    const toD = isoToLocalDate(ret);
    if (!fromD || !toD) return undefined;
    return { from: fromD, to: toD };
  }, [depart, ret]);

  const canSearch = useMemo(() => {
    return (
      Boolean(from.trim()) &&
      Boolean(to.trim()) &&
      Boolean(depart) &&
      Boolean(ret) &&
      ret >= depart &&
      adults >= 1 &&
      priorities.length >= MIN_MOTORHOME_INTERESTS
    );
  }, [from, to, depart, ret, adults, priorities.length]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const togglePriority = (key: MotorhomeInterestKey) => {
    setPriorities((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleDateConfirm = (_label: string, range: DateRange) => {
    if (!range.from || !range.to) return;
    setDepart(dateToIsoLocal(range.from));
    setRet(dateToIsoLocal(range.to));
    setShowCalendar(false);
  };

  const handleSearch = () => {
    if (!canSearch || disabled) return;
    const rangeLabel =
      initialRange?.from && initialRange.to
        ? formatHeroDateRangeLabel(
            { from: initialRange.from, to: initialRange.to },
            lang,
          )
        : `${depart} – ${ret}`;
    const collected: HeroChatCollected = {
      origin: from.trim(),
      destination: to.trim(),
      dates: rangeLabel,
      nights: "",
      passengers: passengersLabel(adults, children, lang),
      pace: "relaxed",
      budget: "500–1000€",
      priorities: [...priorities],
    };
    onSubmit(collected);
  };

  return (
    <div className="relative z-20 w-full">
      <div className="overflow-hidden rounded-2xl border border-white/25 bg-white/95 p-4 text-slate-900 shadow-xl backdrop-blur-md sm:p-5">
        <div className="mb-4 text-center">
          <p className="text-lg font-semibold tracking-tight sm:text-xl">
            {t("mh.browser.title" as never)}
          </p>
          <p className="mt-1 text-sm text-slate-600">{t("mh.browser.subtitle" as never)}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <AirportAutocomplete
            label={t("mh.browser.from" as never)}
            placeholder={t("mh.browser.fromPh" as never)}
            value={from}
            onChange={setFrom}
            kind="place"
          />
          <div className="flex items-end justify-center pb-2">
            <button
              type="button"
              onClick={swap}
              disabled={disabled}
              aria-label={t("mh.browser.swap" as never)}
              className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-sky-700 shadow-sm hover:bg-sky-50 disabled:opacity-50"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </button>
          </div>
          <AirportAutocomplete
            label={t("mh.browser.to" as never)}
            placeholder={t("mh.browser.toPh" as never)}
            value={to}
            onChange={setTo}
            kind="place"
          />
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowCalendar((v) => !v)}
            className={cn(
              "flex min-h-[76px] flex-col justify-center rounded-xl border bg-white px-4 py-2.5 text-left shadow-sm transition",
              showCalendar
                ? "border-sky-500 ring-2 ring-sky-500/20"
                : "border-slate-200 hover:border-sky-300",
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              {t("mh.browser.depart" as never)}
            </span>
            <span className="mt-0.5 text-sm font-medium text-slate-900">
              {formatIsoField(depart, lang)}
            </span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowCalendar((v) => !v)}
            className={cn(
              "flex min-h-[76px] flex-col justify-center rounded-xl border bg-white px-4 py-2.5 text-left shadow-sm transition",
              showCalendar
                ? "border-sky-500 ring-2 ring-sky-500/20"
                : "border-slate-200 hover:border-sky-300",
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              {t("mh.browser.return" as never)}
            </span>
            <span className="mt-0.5 text-sm font-medium text-slate-900">
              {formatIsoField(ret, lang)}
            </span>
          </button>

          <div className="flex min-h-[76px] min-w-0 flex-col justify-center overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:col-span-2 lg:col-span-1 sm:px-4">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <Users className="h-3.5 w-3.5 shrink-0" />
              {t("mh.browser.travelers" as never)}
            </span>
            <div className="mt-1.5 flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {t("mh.browser.adults" as never)}
                </span>
                <Stepper
                  value={adults}
                  min={1}
                  max={8}
                  disabled={disabled}
                  onChange={setAdults}
                />
              </div>
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-xs text-slate-500">
                  {t("mh.browser.children" as never)}
                </span>
                <Stepper
                  value={children}
                  min={0}
                  max={6}
                  disabled={disabled}
                  onChange={setChildren}
                />
              </div>
            </div>
          </div>
        </div>

        {showCalendar ? (
          <div className="mt-3">
            <HeroDateRangeCalendar
              lang={lang}
              confirmLabel={t("heroChat.confirm" as never)}
              disabled={disabled}
              initialRange={initialRange}
              onConfirm={handleDateConfirm}
            />
          </div>
        ) : null}

        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("mh.browser.priorities" as never)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{t("mh.browser.prioritiesHint" as never)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MOTORHOME_INTEREST_KEYS.map((key) => {
              const active = priorities.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => togglePriority(key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    active
                      ? "border-sky-600 bg-sky-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50",
                    disabled && "opacity-50",
                  )}
                >
                  {t(`mh.interest.${key}` as never)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          disabled={!canSearch || disabled}
          onClick={handleSearch}
          className={cn(SEARCH_PRIMARY_BTN, "mt-4 h-12 w-full text-base")}
        >
          {t("mh.browser.search" as never)}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-slate-200 bg-slate-50 px-0.5">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid h-7 w-7 place-items-center rounded-full text-slate-700 hover:bg-white disabled:opacity-40"
        aria-label="-"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[1.25rem] text-center text-sm font-semibold tabular-nums text-slate-900">
        {value}
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid h-7 w-7 place-items-center rounded-full text-slate-700 hover:bg-white disabled:opacity-40"
        aria-label="+"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
