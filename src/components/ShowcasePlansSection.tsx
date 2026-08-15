import { Download, ExternalLink, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

type ShowcasePlan = {
  id: "tanzania" | "peru" | "nyc" | "france" | "motorhome" | "botswana";
  href: string;
  imageUrl: string;
  routeKey: string;
  metaKey: string;
  titleKey: string;
  blurbKey: string;
};

const PLANS: ShowcasePlan[] = [
  {
    id: "tanzania",
    href: "/showcase/tanzania-showcase.pdf",
    imageUrl:
      "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=1400&q=80",
    routeKey: "showcase.tanzania.route",
    metaKey: "showcase.tanzania.meta",
    titleKey: "showcase.tanzania.title",
    blurbKey: "showcase.tanzania.blurb",
  },
  {
    id: "peru",
    href: "/showcase/peru-showcase.pdf",
    imageUrl:
      "https://images.unsplash.com/photo-1526392060635-9d6019884377?auto=format&fit=crop&w=1400&q=80",
    routeKey: "showcase.peru.route",
    metaKey: "showcase.peru.meta",
    titleKey: "showcase.peru.title",
    blurbKey: "showcase.peru.blurb",
  },
  {
    id: "nyc",
    href: "/showcase/nyc-showcase.pdf",
    imageUrl:
      "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1400&q=80",
    routeKey: "showcase.nyc.route",
    metaKey: "showcase.nyc.meta",
    titleKey: "showcase.nyc.title",
    blurbKey: "showcase.nyc.blurb",
  },
  {
    id: "france",
    href: "/showcase/france-showcase.pdf",
    imageUrl:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1400&q=80",
    routeKey: "showcase.france.route",
    metaKey: "showcase.france.meta",
    titleKey: "showcase.france.title",
    blurbKey: "showcase.france.blurb",
  },
  {
    id: "motorhome",
    href: "/showcase/motorhome-nl-showcase.pdf",
    imageUrl:
      "https://images.unsplash.com/photo-1523987355523-c7b5b0dd90a7?auto=format&fit=crop&w=1400&q=80",
    routeKey: "showcase.motorhome.route",
    metaKey: "showcase.motorhome.meta",
    titleKey: "showcase.motorhome.title",
    blurbKey: "showcase.motorhome.blurb",
  },
  {
    id: "botswana",
    href: "/showcase/botswana-showcase.pdf",
    imageUrl:
      "https://images.unsplash.com/photo-1489392191049-fc10c97e64b6?auto=format&fit=crop&w=1400&q=80",
    routeKey: "showcase.botswana.route",
    metaKey: "showcase.botswana.meta",
    titleKey: "showcase.botswana.title",
    blurbKey: "showcase.botswana.blurb",
  },
];

function ShowcasePlanCard({ plan }: { plan: ShowcasePlan }) {
  const { t } = useI18n();
  const fileName = plan.href.split("/").pop() ?? "plan.pdf";

  return (
    <article
      className={cn(
        "group relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-md",
        "transition-all duration-300 hover:-translate-y-1 hover:shadow-xl",
      )}
    >
      <div className="relative h-40 overflow-hidden sm:h-44">
        <img
          src={plan.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent"
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/75">
            {t(plan.routeKey as never)}
          </p>
          <h3 className="mt-0.5 text-xl font-bold text-white">{t(plan.titleKey as never)}</h3>
          <p className="mt-1 text-sm text-white/80">{t(plan.metaKey as never)}</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
          {t(plan.blurbKey as never)}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href={plan.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-semibold text-white transition hover:bg-brand/90 sm:flex-none sm:px-4"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {t("showcase.preview" as never)}
          </a>
          <a
            href={plan.href}
            download={fileName}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition hover:border-brand/30 hover:bg-brand-soft sm:flex-none sm:px-4"
          >
            <Download className="h-4 w-4" aria-hidden />
            {t("showcase.download" as never)}
          </a>
        </div>
      </div>
    </article>
  );
}

/** Curated beta demo PDFs — not live Gemini output. */
export function ShowcasePlansSection() {
  const { t } = useI18n();

  return (
    <section
      className="border-b border-border/60 bg-slate-50/80"
      aria-labelledby="showcase-heading"
    >
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-3 inline-flex items-center gap-2 text-brand">
            <FileText className="h-4 w-4" aria-hidden />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
              {t("showcase.eyebrow" as never)}
            </span>
          </div>
          <h2 id="showcase-heading" className="text-2xl font-bold text-foreground sm:text-3xl">
            {t("showcase.title" as never)}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
            {t("showcase.subtitle" as never)}
          </p>
        </div>

        <Carousel
          opts={{ align: "start", skipSnaps: false }}
          className="mt-8"
        >
          <CarouselContent className="-ml-4">
            {PLANS.map((plan) => (
              <CarouselItem
                key={plan.id}
                className="basis-[min(85vw,300px)] pl-4 sm:basis-[340px] lg:basis-[360px]"
              >
                <ShowcasePlanCard plan={plan} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious
            aria-label={t("showcase.prev" as never)}
            className="left-1 top-[42%] z-10 h-10 w-10 border-border bg-white shadow-md sm:-left-3"
          />
          <CarouselNext
            aria-label={t("showcase.next" as never)}
            className="right-1 top-[42%] z-10 h-10 w-10 border-border bg-white shadow-md sm:-right-3"
          />
        </Carousel>
      </div>
    </section>
  );
}
