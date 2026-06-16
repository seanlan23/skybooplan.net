import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DayPicker,
  type DateRange,
  type MonthCaptionProps,
} from "react-day-picker";
import { cn } from "@/lib/utils";
import { formatHeroDateRangeLabel, isCompleteDateRange } from "@/lib/heroDateRange";

type HeroDateRangeCalendarProps = {
  lang?: string;
  confirmLabel: string;
  onConfirm: (label: string, range: DateRange) => void;
  disabled?: boolean;
  className?: string;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

function GlassMonthCaption({
  calendarMonth,
  displayIndex,
  lang: captionLang = "sl",
}: MonthCaptionProps & { lang?: string }) {
  const locale = captionLang === "sl" ? "sl-SI" : "en-GB";
  const label = calendarMonth.date.toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex h-10 items-center justify-center text-sm font-semibold capitalize text-white">
      {label}
    </div>
  );
}

export function HeroDateRangeCalendar({
  lang = "sl",
  confirmLabel,
  onConfirm,
  disabled = false,
  className,
}: HeroDateRangeCalendarProps) {
  const today = useMemo(() => startOfToday(), []);
  const [range, setRange] = useState<DateRange | undefined>();
  const [month, setMonth] = useState<Date>(() => {
    const d = new Date(today);
    d.setDate(1);
    return d;
  });

  const weekdayLabels =
    lang === "sl"
      ? (["Po", "To", "Sr", "Če", "Pe", "So", "Ne"] as const)
      : (["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const);

  const rangeLabel = range ? formatHeroDateRangeLabel(range, lang) : "";

  function handleConfirm() {
    if (!isCompleteDateRange(range)) return;
    onConfirm(formatHeroDateRangeLabel(range, lang), range);
    setRange(undefined);
  }

  return (
    <div
      className={cn(
        "hero-chips-enter w-full max-w-full rounded-2xl border border-white/20 bg-white/15 p-4 shadow-lg backdrop-blur-md sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1, 12))
          }
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 disabled:opacity-40"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-center text-xs font-medium uppercase tracking-wide text-white/60 sm:hidden">
          {month.toLocaleDateString(lang === "sl" ? "sl-SI" : "en-GB", {
            month: "long",
            year: "numeric",
          })}
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            setMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1, 12))
          }
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/20 disabled:opacity-40"
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-7 gap-1 px-1 sm:hidden">
        {weekdayLabels.map((day) => (
          <div
            key={day}
            className="text-center text-[11px] font-medium uppercase tracking-wide text-white/50"
          >
            {day}
          </div>
        ))}
      </div>

      <DayPicker
        mode="range"
        selected={range}
        onSelect={setRange}
        month={month}
        onMonthChange={setMonth}
        numberOfMonths={2}
        weekStartsOn={1}
        showOutsideDays
        disabled={{ before: today }}
        classNames={{
          months: "flex flex-col gap-6 sm:flex-row sm:gap-8 sm:justify-center",
          month: "space-y-3",
          month_caption: "hidden sm:flex sm:justify-center",
          nav: "hidden",
          month_grid: "w-full border-collapse",
          weekdays: "hidden sm:grid sm:grid-cols-7 sm:gap-1 sm:mb-1",
          weekday: "text-center text-[11px] font-medium uppercase tracking-wide text-white/50",
          week: "grid grid-cols-7 gap-1",
          day: "relative p-0 text-center",
          day_button: cn(
            "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-white transition-colors",
            "hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            "disabled:cursor-not-allowed disabled:opacity-30",
          ),
          selected: "",
          range_start: "",
          range_middle: "",
          range_end: "",
          today: "",
          outside: "text-white/25",
          disabled: "text-white/30 opacity-30",
          hidden: "invisible",
        }}
        modifiersClassNames={{
          today: "!bg-white/30",
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
        components={{
          MonthCaption: (props) => <GlassMonthCaption {...props} lang={lang} />,
          Chevron: ({ orientation, className: chevronClass, ...props }) =>
            orientation === "left" ? (
              <ChevronLeft className={cn("h-4 w-4", chevronClass)} {...props} />
            ) : (
              <ChevronRight className={cn("h-4 w-4", chevronClass)} {...props} />
            ),
        }}
        className="text-white"
      />

      <div className="mt-4 flex flex-col items-stretch gap-3 border-t border-white/15 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-h-[1.25rem] text-sm text-white/80">
          {rangeLabel || (lang === "sl" ? "Izberi odhod in povratek" : "Select departure and return")}
        </p>
        <button
          type="button"
          disabled={disabled || !isCompleteDateRange(range)}
          onClick={handleConfirm}
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
