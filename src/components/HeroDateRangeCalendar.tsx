import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import {
  formatHeroDateRangeLabel,
  formatHeroSingleDateLabel,
  isCompleteDateRange,
  isCompleteSingleDate,
} from "@/lib/heroDateRange";

type HeroDateRangeCalendarProps = {
  lang?: string;
  confirmLabel: string;
  onConfirm: (label: string, range: DateRange) => void;
  disabled?: boolean;
  className?: string;
  /** Pre-fill selection (e.g. motorhome search current dates). */
  initialRange?: DateRange;
  /** One-way = single departure day; return/open-jaw = range. */
  mode?: "range" | "single";
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

function monthTitle(date: Date, lang: string): string {
  const locale = lang === "sl" ? "sl-SI" : lang === "de" ? "de-DE" : "en-GB";
  return date.toLocaleDateString(locale, { month: "long", year: "numeric" });
}

function calendarHint(lang: string, mode: "range" | "single"): string {
  if (mode === "single") {
    if (lang === "sl") return "Izberi datum odhoda";
    if (lang === "de") return "Abflugdatum wählen";
    if (lang === "it") return "Scegli la data di partenza";
    if (lang === "es") return "Elige la fecha de salida";
    if (lang === "fr") return "Choisissez la date de départ";
    return "Select departure date";
  }
  if (lang === "sl") return "Izberi odhod in povratek";
  if (lang === "de") return "Hin- und Rückflug wählen";
  if (lang === "it") return "Scegli andata e ritorno";
  if (lang === "es") return "Elige ida y vuelta";
  if (lang === "fr") return "Choisissez aller et retour";
  return "Select departure and return";
}

export function HeroDateRangeCalendar({
  lang = "sl",
  confirmLabel,
  onConfirm,
  disabled = false,
  className,
  initialRange,
  mode = "range",
}: HeroDateRangeCalendarProps) {
  const today = useMemo(() => startOfToday(), []);
  const [range, setRange] = useState<DateRange | undefined>(initialRange);
  const [single, setSingle] = useState<Date | undefined>(initialRange?.from);
  const [month, setMonth] = useState<Date>(() => {
    const seed = initialRange?.from ?? today;
    return new Date(seed.getFullYear(), seed.getMonth(), 1, 12);
  });
  const [twoMonths, setTwoMonths] = useState(false);

  useEffect(() => {
    if (!initialRange?.from) return;
    setRange(initialRange);
    setSingle(initialRange.from);
    setMonth(new Date(initialRange.from.getFullYear(), initialRange.from.getMonth(), 1, 12));
  }, [initialRange?.from?.getTime(), initialRange?.to?.getTime()]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setTwoMonths(mq.matches && mode === "range");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [mode]);

  const nextMonth = useMemo(
    () => new Date(month.getFullYear(), month.getMonth() + 1, 1, 12),
    [month],
  );

  const weekdayLabels =
    lang === "sl"
      ? (["Po", "To", "Sr", "Če", "Pe", "So", "Ne"] as const)
      : lang === "de"
        ? (["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const)
        : (["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const);

  const rangeLabel =
    mode === "single"
      ? single
        ? formatHeroSingleDateLabel(single, lang)
        : ""
      : range
        ? formatHeroDateRangeLabel(range, lang)
        : "";
  const hint = calendarHint(lang, mode);
  const canConfirm =
    mode === "single" ? isCompleteSingleDate({ from: single }) : isCompleteDateRange(range);

  const canGoBack =
    month.getFullYear() > today.getFullYear() ||
    (month.getFullYear() === today.getFullYear() && month.getMonth() > today.getMonth());

  function shiftMonths(delta: number) {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1, 12));
  }

  function handleConfirm() {
    if (mode === "single") {
      if (!single) return;
      onConfirm(formatHeroSingleDateLabel(single, lang), { from: single, to: single });
      setSingle(undefined);
      setRange(undefined);
      return;
    }
    if (!isCompleteDateRange(range)) return;
    onConfirm(formatHeroDateRangeLabel(range, lang), range);
    setRange(undefined);
  }

  const dayPickerClassNames = {
    months: cn(
      "flex w-full",
      twoMonths ? "flex-row items-start justify-center gap-5" : "flex-col items-center",
    ),
    month: cn("w-full min-w-0 max-w-[15.5rem]", twoMonths ? "flex-1" : ""),
    month_caption: "hidden",
    nav: "hidden",
    month_grid: "h-auto w-full table-fixed border-collapse",
    weekdays: "",
    weekday:
      "h-5 w-[14.2857%] p-0 text-center text-[10px] font-medium uppercase tracking-wide text-white/45",
    week: "",
    day: "h-7 w-[14.2857%] p-0 text-center align-middle",
    day_button: cn(
      "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium text-white transition-colors",
      "hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
      "disabled:cursor-not-allowed disabled:opacity-30",
    ),
    selected: "",
    range_start: "",
    range_middle: "",
    range_end: "",
    today: "",
    outside: "invisible",
    disabled: "text-white/30 opacity-30",
    hidden: "invisible",
  } as const;

  return (
    <div
      className={cn(
        "flex w-full max-w-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/20 bg-black/45 p-2.5 shadow-lg backdrop-blur-md sm:p-4",
        className,
      )}
    >
      <div className="mb-2 flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          disabled={disabled || !canGoBack}
          onClick={() => shiftMonths(-1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-30"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          className={cn(
            "grid min-w-0 flex-1 gap-1 text-center",
            twoMonths ? "grid-cols-2 gap-4" : "grid-cols-1",
          )}
        >
          <p className="truncate text-sm font-semibold capitalize text-white">
            {monthTitle(month, lang)}
          </p>
          {twoMonths ? (
            <p className="truncate text-sm font-semibold capitalize text-white">
              {monthTitle(nextMonth, lang)}
            </p>
          ) : null}
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => shiftMonths(1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
      {mode === "single" ? (
        <DayPicker
          mode="single"
          selected={single}
          onSelect={setSingle}
          month={month}
          onMonthChange={setMonth}
          numberOfMonths={1}
          weekStartsOn={1}
          showOutsideDays={false}
          fixedWeeks
          hideNavigation
          disabled={{ before: today }}
          classNames={dayPickerClassNames}
          modifiersClassNames={{
            today: "!bg-white/25",
            selected: "!bg-blue-500 !text-white hover:!bg-blue-500",
          }}
          formatters={{
            formatWeekdayName: (date) => {
              const idx = (date.getDay() + 6) % 7;
              return weekdayLabels[idx] ?? "";
            },
          }}
          className="w-full text-white [--rdp-day_button-height:1.75rem] [--rdp-day_button-width:1.75rem] [--rdp-day-height:2rem] [--rdp-day-width:2rem]"
        />
      ) : (
        <DayPicker
          mode="range"
          selected={range}
          onSelect={setRange}
          month={month}
          onMonthChange={setMonth}
          numberOfMonths={twoMonths ? 2 : 1}
          weekStartsOn={1}
          showOutsideDays={false}
          fixedWeeks
          hideNavigation
          disabled={{ before: today }}
          classNames={dayPickerClassNames}
          modifiersClassNames={{
            today: "!bg-white/25",
            selected: "!bg-blue-500 !text-white hover:!bg-blue-500",
            range_start: "!bg-blue-500 !text-white rounded-full",
            range_end: "!bg-blue-500 !text-white rounded-full",
            range_middle: "!bg-blue-500/35 !text-white !rounded-none",
          }}
          formatters={{
            formatWeekdayName: (date) => {
              const idx = (date.getDay() + 6) % 7;
              return weekdayLabels[idx] ?? "";
            },
          }}
          className="w-full text-white [--rdp-day_button-height:1.75rem] [--rdp-day_button-width:1.75rem] [--rdp-day-height:1.75rem] [--rdp-day-width:1.75rem]"
        />
      )}
      </div>

      <div className="mt-2 flex shrink-0 flex-col items-stretch gap-2 border-t border-white/15 pt-2">
        <p className="min-h-[1.1rem] text-center text-sm text-white/80 sm:text-left">{rangeLabel || hint}</p>
        <button
          type="button"
          disabled={disabled || !canConfirm}
          onClick={handleConfirm}
          className="inline-flex w-full shrink-0 items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
