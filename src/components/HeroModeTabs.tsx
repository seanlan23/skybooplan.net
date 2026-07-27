import { useI18n } from "@/lib/i18n";
import type { HeroChatMode } from "@/lib/heroChatFlow";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

/** Plan tab still gated; Stays + Avtodom are live. */
const DISABLED_MODES = new Set<HeroChatMode>(["plan"]);

type HeroModeTabsProps = {
  value: HeroChatMode;
  onChange: (mode: HeroChatMode) => void;
};

export function HeroModeTabs({ value, onChange }: HeroModeTabsProps) {
  const { t } = useI18n();
  const comingSoon = t("heroMode.comingSoon" as never);

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="mx-auto mt-8 flex w-full max-w-2xl justify-center sm:max-w-3xl"
        role="tablist"
        aria-label={t("heroMode.label" as never)}
      >
        <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-white/20 bg-white/10 p-1 backdrop-blur-md">
          {TAB_ORDER.map((mode) => {
            const isActive = value === mode;
            const isDisabled = DISABLED_MODES.has(mode);
            const label = t(TAB_LABEL_KEYS[mode] as never);

            const tabClass = cn(
              "inline-flex shrink-0 items-center rounded-full px-3.5 py-2 text-sm transition-colors sm:px-4",
              isDisabled && "cursor-not-allowed text-white/40",
              !isDisabled && isActive && "bg-white/25 font-medium text-white",
              !isDisabled && !isActive && "text-white/60 hover:text-white/90",
            );

            if (isDisabled) {
              return (
                <Tooltip key={mode}>
                  <TooltipTrigger asChild>
                    <span
                      role="tab"
                      aria-selected={false}
                      aria-disabled="true"
                      tabIndex={-1}
                      className={tabClass}
                    >
                      {label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {comingSoon}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(mode)}
                className={cn(
                  tabClass,
                  (mode === "motorhome" || mode === "car") && "relative gap-1.5 pr-2.5 sm:pr-3",
                )}
              >
                {label}
                {mode === "motorhome" || mode === "car" ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide",
                      isActive
                        ? "bg-sky-300 text-slate-900"
                        : "bg-sky-400/95 text-slate-900 shadow-sm",
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
    </TooltipProvider>
  );
}
