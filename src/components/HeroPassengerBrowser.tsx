import { useState, type ReactNode } from "react";
import { Baby, Check, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatPassengersLabel } from "@/lib/heroChatExtract";
import { cn } from "@/lib/utils";

export type PassengerPreset = {
  id: string;
  adults: number;
  children: number;
};

const PRESETS: PassengerPreset[] = [
  { id: "solo", adults: 1, children: 0 },
  { id: "couple", adults: 2, children: 0 },
  { id: "family1", adults: 2, children: 1 },
  { id: "family2", adults: 2, children: 2 },
  { id: "friends3", adults: 3, children: 0 },
  { id: "friends4", adults: 4, children: 0 },
];

function PeopleGlyph({ adults, children }: { adults: number; children: number }) {
  const total = Math.min(6, adults + children);
  return (
    <div className="flex items-end justify-center gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => {
        const isChild = i >= adults;
        return (
          <span
            key={i}
            className={cn(
              "rounded-full bg-white/90",
              isChild ? "mb-0.5 h-5 w-3.5" : "h-7 w-4",
            )}
          />
        );
      })}
    </div>
  );
}

export function HeroPassengerBrowser({
  disabled,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (label: string, adults: number, children: number) => void;
}) {
  const { t, lang } = useI18n();
  const [customOpen, setCustomOpen] = useState(false);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function pickPreset(preset: PassengerPreset) {
    if (disabled) return;
    setSelectedId(preset.id);
    setCustomOpen(false);
    onSelect(
      formatPassengersLabel(preset.adults, preset.children, lang),
      preset.adults,
      preset.children,
    );
  }

  function confirmCustom() {
    if (disabled) return;
    setSelectedId("custom");
    onSelect(formatPassengersLabel(adults, children, lang), adults, children);
  }

  return (
    <div className="hero-chips-enter space-y-3 pl-0 sm:pl-10">
      <div>
        <p className="text-base font-semibold text-white">
          {t("heroChat.passengers.browserTitle" as never)}
        </p>
        <p className="mt-0.5 text-sm text-white/70">
          {t("heroChat.passengers.browserHint" as never)}
        </p>
      </div>

      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:thin]">
        {PRESETS.map((preset) => {
          const selected = selectedId === preset.id;
          const title = t(`heroChat.passengers.card.${preset.id}` as never);
          const subtitle = formatPassengersLabel(preset.adults, preset.children, lang);
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => pickPreset(preset)}
              className={cn(
                "group relative flex w-[148px] shrink-0 flex-col rounded-2xl border p-4 text-left transition-all",
                "bg-white/10 backdrop-blur-md hover:-translate-y-0.5 hover:bg-white/16",
                selected
                  ? "border-sky-300/80 bg-sky-500/25 shadow-[0_0_0_1px_rgba(56,189,248,0.45)]"
                  : "border-white/20",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {selected ? (
                <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-400 text-white">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
              ) : null}
              <div className="mb-3 flex h-12 items-end justify-center rounded-xl bg-gradient-to-b from-white/15 to-white/5 py-2">
                <PeopleGlyph adults={preset.adults} children={preset.children} />
              </div>
              <span className="text-sm font-semibold text-white">{title}</span>
              <span className="mt-0.5 text-xs text-white/65">{subtitle}</span>
            </button>
          );
        })}

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setCustomOpen(true);
            setSelectedId("custom");
          }}
          className={cn(
            "flex w-[148px] shrink-0 flex-col rounded-2xl border p-4 text-left transition-all",
            "bg-white/10 backdrop-blur-md hover:-translate-y-0.5 hover:bg-white/16",
            selectedId === "custom" || customOpen
              ? "border-sky-300/80 bg-sky-500/25"
              : "border-white/20 border-dashed",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <div className="mb-3 flex h-12 items-center justify-center rounded-xl bg-gradient-to-b from-white/15 to-white/5">
            <Users className="h-6 w-6 text-white/80" aria-hidden />
          </div>
          <span className="text-sm font-semibold text-white">
            {t("heroChat.passengers.card.custom" as never)}
          </span>
          <span className="mt-0.5 text-xs text-white/65">
            {t("heroChat.passengers.card.customHint" as never)}
          </span>
        </button>
      </div>

      {customOpen ? (
        <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
          <div className="flex flex-wrap items-end gap-4">
            <Stepper
              icon={<Users className="h-4 w-4" aria-hidden />}
              label={t("heroChat.passengers.adults" as never)}
              value={adults}
              min={1}
              max={9}
              disabled={disabled}
              onChange={setAdults}
            />
            <Stepper
              icon={<Baby className="h-4 w-4" aria-hidden />}
              label={t("heroChat.passengers.children" as never)}
              value={children}
              min={0}
              max={8}
              disabled={disabled}
              onChange={setChildren}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={confirmCustom}
              className="ml-auto rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-sky-400 disabled:opacity-50"
            >
              {t("heroChat.passengers.confirm" as never)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stepper({
  icon,
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-white/70">
        {icon}
        {label}
      </p>
      <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-1.5 py-1">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white transition hover:bg-white/15 disabled:opacity-35"
          aria-label={`− ${label}`}
        >
          −
        </button>
        <span className="min-w-[1.5rem] text-center text-base font-semibold tabular-nums text-white">
          {value}
        </span>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-white transition hover:bg-white/15 disabled:opacity-35"
          aria-label={`+ ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
