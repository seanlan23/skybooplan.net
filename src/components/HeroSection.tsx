import { useI18n } from "@/lib/i18n";
import { useHeroPhoto } from "@/hooks/useHeroPhoto";
import { HeroChatFlow } from "@/components/HeroChatFlow";
import type { HeroChatCollected } from "@/lib/heroChatFlow";

export function HeroSection({
  onSearch,
  loading = false,
  seedDestination = null,
  onSeedConsumed,
}: {
  onSearch: (query: string, collected: HeroChatCollected) => void;
  loading?: boolean;
  seedDestination?: string | null;
  onSeedConsumed?: () => void;
}) {
  const { t } = useI18n();
  const { url, photographer } = useHeroPhoto();

  return (
    <section
      className="relative isolate flex min-h-screen w-full flex-col items-center justify-center overflow-hidden pb-10"
      aria-label={t("hero.sectionLabel" as never)}
    >
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center" }}
        role="img"
        aria-hidden
      />

      <div className="absolute inset-0 bg-black/50" aria-hidden />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background to-transparent"
        aria-hidden
      />

      <div className="relative z-10 mx-auto w-full min-w-0 max-w-5xl px-5 py-24 text-center sm:px-6 sm:py-28">
        <div className="mb-5 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-md">
          {t("hero.badge" as never)}
        </div>

        <h1 className="text-4xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
          {t("hero.chatHeadline" as never)}
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-base text-white/70 sm:text-lg">
          {t("hero.chatSubtitle" as never)}
        </p>

        <HeroChatFlow
          onSearch={onSearch}
          loading={loading}
          seedDestination={seedDestination}
          onSeedConsumed={onSeedConsumed}
        />

        {photographer ? (
          <p className="mt-6 text-[11px] text-white/40">
            {t("hero.photoCredit" as never).replace("{name}", photographer)}
          </p>
        ) : null}
      </div>
    </section>
  );
}
