import { useI18n } from "@/lib/i18n";
import type { HeroChatMode } from "@/lib/heroChatFlow";
import { cn } from "@/lib/utils";

const TAB_ORDER: HeroChatMode[] = ["flights", "stays", "car", "motorhome", "plan", "all"];

const TAB_LABEL_KEYS: Record<HeroChatMode, string> = {
  flights: "heroMode.flights",
  stays: "heroMode.stays",
  car: "heroMode.car",
  motorhome: "heroMode.motorhome",
  plan: "heroMode.plan",
  all: "heroMode.all",
};

/** Plan tab still gated; Stays + road modes are live. */
const DISABLED_MODES = new Set<HeroChatMode>(["plan"]);

type HeroModeTabsProps = {
  value: HeroChatMode;
  onChange: (mode: HeroChatMode) => void;
};

export function HeroModeTabs({ value, onChange }: HeroModeTabsProps) {
  const { t } = useI18n();
  const comingSoon = t("heroMode.comingSoon" as never);

  return (
    <div
      className="mx-auto mt-8 w-full max-w-md sm:max-w-2xl"
      role="tablist"
      aria-label={t("heroMode.label" as never)}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TAB_ORDER.map((mode) => {
          const isActive = value === mode;
          const isDisabled = DISABLED_MODES.has(mode);
          const label = t(TAB_LABEL_KEYS[mode] as never);
          const isWide = mode === "all";

          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              title={isDisabled ? comingSoon : undefined}
              onClick={() => {
                if (!isDisabled) onChange(mode);
              }}
              className={cn(
                "flex min-h-[52px] items-center justify-center gap-1.5 rounded-2xl border px-3 py-3 text-sm font-semibold transition",
                isWide && "col-span-2 sm:col-span-1",
                isDisabled && "cursor-not-allowed border-white/10 bg-white/5 text-white/35",
                !isDisabled &&
                  isActive &&
                  "border-white bg-white text-slate-900 shadow-sm",
                !isDisabled &&
                  !isActive &&
                  "border-white/20 bg-white/10 text-white hover:bg-white/20 active:scale-[0.99]",
              )}
            >
              <span>{label}</span>
              {mode === "motorhome" || mode === "car" ? (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide",
                    isActive ? "bg-sky-600 text-white" : "bg-sky-400 text-slate-900",
                  )}
                >
                  {t("heroMode.newBadge" as never)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
