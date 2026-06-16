import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export type InspirationCard = {
  id: string;
  title: string;
  emoji: string;
  destination: string;
  query: string;
  unsplashQuery: string;
  fallbackUrl: string;
};

const CARDS: InspirationCard[] = [
  {
    id: "paris",
    title: "Romantični Pariz",
    emoji: "🗼",
    destination: "Pariz",
    query: "Načrtuj mi 5-dnevni romantični trip v Pariz",
    unsplashQuery: "paris romance eiffel",
    fallbackUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80",
  },
  {
    id: "croatia",
    title: "Roadtrip po Hrvaški",
    emoji: "🌊",
    destination: "Hrvaška",
    query: "Načrtuj roadtrip po Hrvaški za 7 dni",
    unsplashQuery: "croatia coast",
    fallbackUrl: "https://images.unsplash.com/photo-1555990793522-b9f8c2d25d33?w=600&q=80",
  },
  {
    id: "asia",
    title: "Bangkok & Bali",
    emoji: "🌴",
    destination: "Bali",
    query: "Načrtuj 10-dnevni trip Bangkok in Bali",
    unsplashQuery: "bali temple tropical",
    fallbackUrl: "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?w=800&q=80",
  },
];

async function fetchCardPhoto(query: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ query });
    const res = await fetch(`/api/hero-photo?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string | null };
    return data.url ?? null;
  } catch {
    return null;
  }
}

function InspirationCardItem({
  card,
  onSelect,
}: {
  card: InspirationCard;
  onSelect: (destination: string) => void;
}) {
  const { t } = useI18n();
  const [imageUrl, setImageUrl] = useState(card.fallbackUrl);

  useEffect(() => {
    let cancelled = false;
    void fetchCardPhoto(card.unsplashQuery).then((apiUrl) => {
      if (cancelled || !apiUrl) return;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setImageUrl(apiUrl);
      };
      img.onerror = () => {
        if (!cancelled) setImageUrl(card.fallbackUrl);
      };
      img.src = apiUrl;
    });
    return () => {
      cancelled = true;
    };
  }, [card.unsplashQuery, card.fallbackUrl]);

  return (
    <article
      className={cn(
        "group relative flex h-[280px] w-[min(85vw,320px)] shrink-0 snap-center flex-col justify-end overflow-hidden rounded-2xl sm:h-[320px] sm:w-auto sm:flex-1",
        "border border-border/80 shadow-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
      )}
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url(${imageUrl})` }}
        role="img"
        aria-label={card.title}
      />
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10"
        aria-hidden
      />
      <div className="relative z-10 p-5 text-left">
        <p className="text-2xl leading-none" aria-hidden>
          {card.emoji}
        </p>
        <h3 className="mt-2 text-lg font-bold text-white sm:text-xl">{card.title}</h3>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-4 h-9 rounded-lg bg-white/95 text-foreground hover:bg-white"
          onClick={() => onSelect(card.destination)}
        >
          {t("inspiration.cta" as never)}
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
        </Button>
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
