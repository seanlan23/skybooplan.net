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
      className={
        staySearch
          ? "relative isolate -mb-px flex min-h-screen w-full flex-col items-center justify-start overflow-x-clip pb-16"
          : "relative isolate -mb-px flex min-h-screen w-full flex-col items-center justify-center overflow-x-clip overscroll-y-none pb-10"
      }
      aria-label={t("hero.sectionLabel" as never)}
    >
      <HeroRotatingBackground />

      {/* Soft vignette — fade out at bottom so no black hairline above the AI plan */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-transparent"
        aria-hidden
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-background from-35% via-background/85 to-transparent"
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
            ? "relative z-10 mx-auto w-full min-w-0 max-w-5xl px-5 pb-8 pt-[calc(6rem+env(safe-area-inset-top))] text-center sm:px-6 sm:pt-[calc(7rem+env(safe-area-inset-top))]"
            : "relative z-10 mx-auto w-full min-w-0 max-w-5xl px-5 pb-24 pt-[calc(6rem+env(safe-area-inset-top))] text-center sm:px-6 sm:pb-28 sm:pt-[calc(7rem+env(safe-area-inset-top))]"
        }
      >
        <div className="mb-5 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-md">
          {t("hero.badge" as never)}
        </div>

        <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
          {t("hero.chatHeadline" as never)}
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-base text-white/70 sm:text-lg">
          {t("hero.chatSubtitle" as never)}
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
