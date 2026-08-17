import { useI18n } from "@/lib/i18n";
import type { HeroChatMode } from "@/lib/heroChatFlow";
import { cn } from "@/lib/utils";

const HERO_MODES: HeroChatMode[] = ["all", "flights", "stays", "car", "motorhome"];

const TAB_LABEL_KEYS: Record<HeroChatMode, string> = {
  flights: "heroMode.flights",
  stays: "heroMode.stays",
  car: "heroMode.car",
  motorhome: "heroMode.motorhome",
  plan: "heroMode.plan",
  all: "heroMode.all",
};

const TAB_HINT_KEYS: Record<HeroChatMode, string> = {
  flights: "heroMode.hint.flights",
  stays: "heroMode.hint.stays",
  car: "heroMode.hint.car",
  motorhome: "heroMode.hint.motorhome",
  plan: "heroMode.hint.plan",
  all: "heroMode.hint.all",
};

type HeroModeTabsProps = {
  value: HeroChatMode;
  onChange: (mode: HeroChatMode) => void;
};

function ModeButton({
  mode,
  value,
  onChange,
  label,
}: {
  mode: HeroChatMode;
  value: HeroChatMode;
  onChange: (mode: HeroChatMode) => void;
  label: string;
}) {
  const isActive = value === mode;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onChange(mode)}
      className={cn(
        "rounded-full px-2.5 py-1.5 text-[12px] font-medium leading-none transition sm:px-3.5 sm:text-sm",
        isActive
          ? "bg-white text-slate-900 shadow-sm"
          : "text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      {label}
    </button>
  );
}

function ModeRow({
  modes,
  value,
  onChange,
  className,
}: {
  modes: HeroChatMode[];
  value: HeroChatMode;
  onChange: (mode: HeroChatMode) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "inline-flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-3xl border border-white/20 bg-black/30 p-1 backdrop-blur-md",
        className,
      )}
      role="tablist"
      aria-label={t("heroMode.label" as never)}
    >
      {modes.map((mode) => (
        <ModeButton
          key={mode}
          mode={mode}
          value={value}
          onChange={onChange}
          label={t(TAB_LABEL_KEYS[mode] as never)}
        />
      ))}
    </div>
  );
}

export function HeroModeTabs({ value, onChange }: HeroModeTabsProps) {
  const { t } = useI18n();
  return (
    <div className="mx-auto mt-3 flex w-full flex-col items-center sm:mt-5">
      <ModeRow modes={HERO_MODES} value={value} onChange={onChange} />
      <p className="mt-2 max-w-md text-center text-[12px] leading-snug text-white/65 sm:mt-2.5 sm:text-sm">
        {t(TAB_HINT_KEYS[value] as never)}
      </p>
    </div>
  );
}
