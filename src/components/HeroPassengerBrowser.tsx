import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { formatPassengersLabel } from "@/lib/heroChatExtract";

/** Compact Skyscanner-style traveler counts — no preset card carousel. */
export function HeroPassengerBrowser({
  disabled,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (label: string, adults: number, children: number) => void;
}) {
  const { t, lang } = useI18n();
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  function confirm() {
    if (disabled) return;
    onSelect(formatPassengersLabel(adults, children, lang), adults, children);
  }

  return (
    <div className="hero-chips-enter max-w-md space-y-2 pl-0 sm:pl-10">
      <p className="text-sm font-semibold text-white">
        {t("heroChat.passengers.browserTitle" as never)}
      </p>

      <div className="rounded-2xl border border-white/20 bg-white/10 px-3 py-2 backdrop-blur-md">
        <CountRow
          label={t("heroChat.passengers.adults" as never)}
          hint={t("heroChat.passengers.adultsHint" as never)}
          value={adults}
          min={1}
          max={9}
          disabled={disabled}
          onChange={setAdults}
        />
        <div className="my-1.5 h-px bg-white/15" />
        <CountRow
          label={t("heroChat.passengers.children" as never)}
          hint={t("heroChat.passengers.childrenHint" as never)}
          value={children}
          min={0}
          max={8}
          disabled={disabled}
          onChange={setChildren}
        />
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={confirm}
        className="w-full rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-sky-400 disabled:opacity-50 sm:w-auto sm:min-w-[10rem]"
      >
        {t("heroChat.passengers.confirm" as never)}
      </button>
    </div>
  );
}

function CountRow({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-[11px] text-white/55">{hint}</p>
      </div>
      <div className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/20 bg-black/20 px-1 py-0.5">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-white transition hover:bg-white/15 disabled:opacity-30"
          aria-label={`− ${label}`}
        >
          −
        </button>
        <span className="min-w-[1.75rem] text-center text-base font-semibold tabular-nums text-white">
          {value}
        </span>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none text-white transition hover:bg-white/15 disabled:opacity-30"
          aria-label={`+ ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
