import { useMemo, useState } from "react";
import { ArrowLeftRight, ArrowRight, Minus, Plus, Users } from "lucide-react";
import { AirportAutocomplete } from "@/components/AirportAutocomplete";
import { useI18n } from "@/lib/i18n";
import type { HeroChatCollected } from "@/lib/heroChatFlow";
import { SEARCH_PRIMARY_BTN } from "@/components/searchFieldStyles";
import { cn } from "@/lib/utils";

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

/** Skyscanner-style motorhome search: From → To · dates · travelers · Search. */
export function MotorhomeSearchBrowser({ disabled, onSubmit }: MotorhomeSearchBrowserProps) {
  const { t, lang } = useI18n();
  const [from, setFrom] = useState("Vienna");
  const [to, setTo] = useState("Croatia");
  const [depart, setDepart] = useState(defaultDepartIso);
  const [ret, setRet] = useState(() => defaultReturnIso(defaultDepartIso()));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const canSearch = useMemo(() => {
    return (
      Boolean(from.trim()) &&
      Boolean(to.trim()) &&
      Boolean(depart) &&
      Boolean(ret) &&
      ret >= depart &&
      adults >= 1
    );
  }, [from, to, depart, ret, adults]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const handleSearch = () => {
    if (!canSearch || disabled) return;
    const collected: HeroChatCollected = {
      origin: from.trim(),
      destination: to.trim(),
      dates: `${depart} – ${ret}`,
      nights: "",
      passengers: passengersLabel(adults, children, lang),
      pace: "relaxed",
      budget: "500–1000€",
    };
    onSubmit(collected);
  };

  return (
    <div className="relative z-20 w-full">
      <div className="rounded-2xl border border-white/25 bg-white/95 p-4 text-slate-900 shadow-xl backdrop-blur-md sm:p-5">
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
          <label className="flex min-h-[76px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("mh.browser.depart" as never)}
            </span>
            <input
              type="date"
              value={depart}
              disabled={disabled}
              onChange={(e) => {
                const next = e.target.value;
                setDepart(next);
                if (ret < next) setRet(defaultReturnIso(next));
              }}
              className="mt-0.5 bg-transparent text-sm font-medium text-slate-900 outline-none"
            />
          </label>
          <label className="flex min-h-[76px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("mh.browser.return" as never)}
            </span>
            <input
              type="date"
              value={ret}
              min={depart}
              disabled={disabled}
              onChange={(e) => setRet(e.target.value)}
              className="mt-0.5 bg-transparent text-sm font-medium text-slate-900 outline-none"
            />
          </label>

          <div className="flex min-h-[76px] flex-col justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm sm:col-span-2 lg:col-span-1">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <Users className="h-3.5 w-3.5" />
              {t("mh.browser.travelers" as never)}
            </span>
            <div className="mt-1 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{t("mh.browser.adults" as never)}</span>
                <Stepper
                  value={adults}
                  min={1}
                  max={8}
                  disabled={disabled}
                  onChange={setAdults}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{t("mh.browser.children" as never)}</span>
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
    <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid h-7 w-7 place-items-center rounded-full text-slate-700 hover:bg-white disabled:opacity-40"
        aria-label="-"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[1.25rem] text-center text-sm font-semibold tabular-nums">{value}</span>
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
