import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { HeroChatFlow } from "@/components/HeroChatFlow";
import { HeroModeTabs } from "@/components/HeroModeTabs";
import { HeroRotatingBackground } from "@/components/HeroRotatingBackground";
import type { HeroChatCollected, HeroChatMode } from "@/lib/heroChatFlow";
import type { HeroStaySearchParams } from "@/lib/heroStaySearch";

export function HeroSection({
  onSearch,
  loading = false,
  flights = [],
  searchError = null,
  seedDestination = null,
  onSeedConsumed,
  onModeChange,
  onClearSearch,
  selectedFlightId = null,
  onSelectFlightForAiPlan,
  flightSearchMeta = null,
  flightAdults = 1,
  staySearch = null,
}: {
  onSearch: (query: string, collected: HeroChatCollected, mode: HeroChatMode) => void;
  loading?: boolean;
  flights?: import("@/lib/makeSearch").MakeSearchFlight[];
  searchError?: string | null;
  seedDestination?: string | null;
  onSeedConsumed?: () => void;
  onModeChange?: (mode: HeroChatMode) => void;
  onClearSearch?: () => void;
  selectedFlightId?: string | null;
  onSelectFlightForAiPlan?: (flight: import("@/lib/makeSearch").MakeSearchFlight) => void;
  flightSearchMeta?: {
    from?: string;
    to?: string;
    departDate?: string;
    returnDate?: string;
  } | null;
  flightAdults?: number;
  staySearch?: HeroStaySearchParams | null;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<HeroChatMode>("all");

  function handleModeChange(next: HeroChatMode) {
    setMode(next);
    onModeChange?.(next);
  }

  return (
    <section
      className="relative isolate -mb-px flex min-h-[100svh] w-full flex-col items-center justify-start overflow-x-clip overscroll-y-none pb-10 [overflow-anchor:none]"
      aria-label={t("hero.sectionLabel" as never)}
    >
      <HeroRotatingBackground />

      {/* Soft vignette — fade out at bottom so no black hairline above the AI plan */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-transparent"
        aria-hidden
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background from-20% via-background/75 to-transparent sm:h-40"
        aria-hidden
      />
      {/* Solid bridge into the next section (kills Safari 1px seam) */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-background"
        aria-hidden
      />

      <div
        className={
          staySearch
            ? "relative z-10 mx-auto w-full min-w-0 max-w-5xl px-5 pb-8 pt-[calc(5.25rem+env(safe-area-inset-top))] text-center sm:px-6 sm:pt-[calc(7rem+env(safe-area-inset-top))]"
            : "relative z-10 mx-auto w-full min-w-0 max-w-5xl px-5 pb-16 pt-[calc(5.25rem+env(safe-area-inset-top))] text-center sm:px-6 sm:pb-20 sm:pt-[calc(7rem+env(safe-area-inset-top))]"
        }
      >
        <h1 className="text-[1.65rem] font-black leading-[1.12] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
          {t("hero.chatHeadline" as never)}
        </h1>

        <p className="mx-auto mt-2 hidden max-w-xl text-base text-white/70 sm:mt-4 sm:block sm:text-lg">
          {t("hero.chatSubtitle" as never)}
        </p>

        <p className="mx-auto mt-2 text-xs font-medium tracking-wide text-white/80 sm:mt-3 sm:text-sm">
          {t("hero.trust" as never)}
        </p>

        <HeroModeTabs value={mode} onChange={handleModeChange} />

        <HeroChatFlow
          key={mode}
          mode={mode}
          onSearch={onSearch}
          loading={loading}
          flights={flights}
          searchError={searchError}
          seedDestination={seedDestination}
          onSeedConsumed={onSeedConsumed}
          selectedFlightId={selectedFlightId}
          onSelectFlightForAiPlan={onSelectFlightForAiPlan}
          flightSearchMeta={flightSearchMeta}
          flightAdults={flightAdults}
          staySearch={staySearch}
          onClearSearch={onClearSearch}
        />
      </div>
    </section>
  );
}
