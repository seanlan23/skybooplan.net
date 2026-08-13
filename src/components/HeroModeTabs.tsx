import { useI18n } from "@/lib/i18n";
import type { HeroChatMode } from "@/lib/heroChatFlow";
import { cn } from "@/lib/utils";

const MOBILE_MODES: HeroChatMode[] = ["all", "flights", "stays"];
const DESKTOP_MODES: HeroChatMode[] = ["all", "flights", "stays", "car", "motorhome"];

const TAB_LABEL_KEYS: Record<HeroChatMode, string> = {
  flights: "heroMode.flights",
  stays: "heroMode.stays",
  car: "heroMode.car",
  motorhome: "heroMode.motorhome",
  plan: "heroMode.plan",
  all: "heroMode.all",
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
  newBadge,
  large,
}: {
  mode: HeroChatMode;
  value: HeroChatMode;
  onChange: (mode: HeroChatMode) => void;
  label: string;
  newBadge?: string;
  large?: boolean;
}) {
  const isActive = value === mode;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => onChange(mode)}
      className={cn(
        "flex items-center justify-center gap-1.5 border font-semibold transition",
        large ? "min-h-14 rounded-2xl px-4 py-3.5 text-base" : "min-h-[52px] rounded-2xl px-3 py-3 text-sm",
        isActive
          ? "border-white bg-white text-slate-900 shadow-sm"
          : "border-white/20 bg-white/10 text-white hover:bg-white/20 active:scale-[0.99]",
      )}
    >
      <span>{label}</span>
      {newBadge ? (
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide",
            isActive ? "bg-sky-600 text-white" : "bg-sky-400 text-slate-900",
          )}
        >
          {newBadge}
        </span>
      ) : null}
    </button>
  );
}

export function HeroModeTabs({ value, onChange }: HeroModeTabsProps) {
  const { t } = useI18n();
  const newBadge = t("heroMode.newBadge" as never);

  return (
    <div className="mx-auto mt-8 w-full max-w-md sm:max-w-3xl" role="tablist" aria-label={t("heroMode.label" as never)}>
      <div className="grid gap-2 sm:hidden">
        <ModeButton
          mode="all"
          value={value}
          onChange={onChange}
          label={t(TAB_LABEL_KEYS.all as never)}
          large
        />
        <div className="grid grid-cols-2 gap-2">
          {MOBILE_MODES.filter((m) => m !== "all").map((mode) => (
            <ModeButton
              key={mode}
              mode={mode}
              value={value}
              onChange={onChange}
              label={t(TAB_LABEL_KEYS[mode] as never)}
            />
          ))}
        </div>
      </div>

      <div className="hidden grid-cols-5 gap-2 sm:grid">
        {DESKTOP_MODES.map((mode) => (
          <ModeButton
            key={mode}
            mode={mode}
            value={value}
            onChange={onChange}
            label={t(TAB_LABEL_KEYS[mode] as never)}
            newBadge={mode === "car" || mode === "motorhome" ? newBadge : undefined}
          />
        ))}
      </div>
    </div>
  );
}
