import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { formatHeroDateRangeLabel, isCompleteDateRange } from "@/lib/heroDateRange";

type HeroDateRangeCalendarProps = {
  lang?: string;
  confirmLabel: string;
  onConfirm: (label: string, range: DateRange) => void;
  disabled?: boolean;
  className?: string;
  /** Pre-fill selection (e.g. motorhome search current dates). */
  initialRange?: DateRange;
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

export function HeroDateRangeCalendar({
  lang = "sl",
  confirmLabel,
  onConfirm,
  disabled = false,
  className,
  initialRange,
}: HeroDateRangeCalendarProps) {
  const today = useMemo(() => startOfToday(), []);
  const [range, setRange] = useState<DateRange | undefined>(initialRange);
  const [month, setMonth] = useState<Date>(() => {
    const seed = initialRange?.from ?? today;
    return new Date(seed.getFullYear(), seed.getMonth(), 1, 12);
  });
  const [twoMonths, setTwoMonths] = useState(false);

  useEffect(() => {
    if (!initialRange?.from) return;
    setRange(initialRange);
    setMonth(new Date(initialRange.from.getFullYear(), initialRange.from.getMonth(), 1, 12));
  }, [initialRange?.from?.getTime(), initialRange?.to?.getTime()]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setTwoMonths(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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

  const rangeLabel = range ? formatHeroDateRangeLabel(range, lang) : "";
  const hint =
    lang === "sl"
      ? "Izberi odhod in povratek"
      : lang === "de"
        ? "Hin- und Rückflug wählen"
        : "Select departure and return";

  const canGoBack =
    month.getFullYear() > today.getFullYear() ||
    (month.getFullYear() === today.getFullYear() && month.getMonth() > today.getMonth());

  function shiftMonths(delta: number) {
    setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1, 12));
  }

  function handleConfirm() {
    if (!isCompleteDateRange(range)) return;
    onConfirm(formatHeroDateRangeLabel(range, lang), range);
    setRange(undefined);
  }

  return (
    <div
      className={cn(
        "hero-chips-enter w-full max-w-full rounded-2xl border border-white/20 bg-black/45 p-3 shadow-lg backdrop-blur-md sm:p-4",
        className,
      )}
    >
      {/* One nav row: arrows sit with the month titles — not floating above an empty strip */}
      <div className="mb-3 flex items-center gap-1 sm:gap-2">
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
        classNames={{
          months: cn(
            "flex w-full",
            twoMonths
              ? "flex-row items-start justify-center gap-5"
              : "flex-col items-center",
          ),
          month: cn(
            "w-full min-w-0 max-w-[15.5rem]",
            twoMonths ? "flex-1" : "",
          ),
          month_caption: "hidden",
          nav: "hidden",
          // Stable height: weekday row + 6 week rows (avoids hero recenter jump)
          month_grid: "h-[13.5rem] w-full table-fixed border-collapse",
          weekdays: "",
          weekday:
            "h-6 w-[14.2857%] p-0 text-center text-[10px] font-medium uppercase tracking-wide text-white/45",
          week: "",
          day: "h-8 w-[14.2857%] p-0 text-center align-middle",
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
        }}
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
        className="w-full text-white [--rdp-day_button-height:1.75rem] [--rdp-day_button-width:1.75rem] [--rdp-day-height:2rem] [--rdp-day-width:2rem]"
      />

      <div className="mt-3 flex flex-col items-stretch gap-2 border-t border-white/15 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-[1.1rem] text-sm text-white/80">{rangeLabel || hint}</p>
        <button
          type="button"
          disabled={disabled || !isCompleteDateRange(range)}
          onClick={handleConfirm}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
