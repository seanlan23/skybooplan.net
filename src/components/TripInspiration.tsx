import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type InspirationCardDef = {
  id: "paris" | "dubai" | "asia";
  emoji: string;
  /** English search destination — stable across languages. */
  destination: string;
  titleKey: string;
  /** Fixed curated photo — no API dependency (reliable on cards). */
  imageUrl: string;
};

const CARDS: InspirationCardDef[] = [
  {
    id: "paris",
    emoji: "🗼",
    destination: "Paris",
    titleKey: "inspiration.paris.title",
    imageUrl:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "dubai",
    emoji: "🏙️",
    destination: "Dubai",
    titleKey: "inspiration.dubai.title",
    imageUrl:
      "https://images.unsplash.com/photo-1512453979798-5ea9516f8e4d?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "asia",
    emoji: "🌴",
    destination: "Bali",
    titleKey: "inspiration.asia.title",
    imageUrl:
      "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?auto=format&fit=crop&w=1200&q=80",
  },
];

function InspirationCardItem({
  card,
  onSelect,
}: {
  card: InspirationCardDef;
  onSelect: (destination: string) => void;
}) {
  const { t } = useI18n();

  return (
    <article
      className={cn(
        "group relative flex h-[280px] w-[min(85vw,320px)] shrink-0 snap-center flex-col justify-end overflow-hidden rounded-2xl sm:h-[320px] sm:w-auto sm:flex-1",
        "border border-border/80 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
      )}
    >
      <img
        src={card.imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15"
        aria-hidden
      />
      <div className="relative z-10 p-5 text-left">
        <p className="text-2xl leading-none" aria-hidden>
          {card.emoji}
        </p>
        <h3 className="mt-2 text-lg font-bold text-white sm:text-xl">
          {t(card.titleKey as never)}
        </h3>
        <button
          type="button"
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/95 px-3 text-sm font-semibold text-foreground transition hover:bg-white"
          onClick={() => onSelect(card.destination)}
        >
          {t("inspiration.cta" as never)}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </article>
  );
}

export function TripInspiration({
  onSelectDestination,
}: {
  onSelectDestination: (destination: string) => void;
}) {
  const { t } = useI18n();

  return (
    <section className="border-b border-border/60 bg-background" aria-labelledby="inspiration-heading">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-14">
        <div className="text-center">
          <h2 id="inspiration-heading" className="text-2xl font-bold text-foreground sm:text-3xl">
            {t("inspiration.title" as never)}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            {t("inspiration.subtitle" as never)}
          </p>
        </div>

        <div
          className={cn(
            "mt-8 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory",
            "sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0",
          )}
        >
          {CARDS.map((card) => (
            <InspirationCardItem key={card.id} card={card} onSelect={onSelectDestination} />
          ))}
        </div>
      </div>
    </section>
  );
}
