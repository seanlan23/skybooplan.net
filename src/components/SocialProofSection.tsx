import { Heart, Plane, Sparkles, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { PARTNER_LOGOS } from "@/components/PartnerLogos";

type SocialFeature = {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
};

export function SocialProofSection() {
  const { t, lang } = useI18n();

  const features = useMemo<SocialFeature[]>(
    () => [
      {
        id: "ai",
        icon: Sparkles,
        title: t("social.feat.ai.title" as never),
        desc: t("social.feat.ai.desc" as never),
      },
      {
        id: "flights",
        icon: Plane,
        title: t("social.feat.flights.title" as never),
        desc: t("social.feat.flights.desc" as never),
      },
      {
        id: "free",
        icon: Heart,
        title: t("social.feat.free.title" as never),
        desc: t("social.feat.free.desc" as never),
      },
    ],
    [lang, t],
  );

  return (
    <section
      className="relative z-10 overflow-x-clip border-b border-border/60 bg-background"
      aria-labelledby="social-proof-heading"
    >
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-14">
        <p
          id="social-proof-heading"
          className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
        >
          {t("social.trustedBy" as never)}
        </p>

        <ul className="mt-8 grid grid-cols-3 items-center justify-items-center gap-6 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-16 sm:gap-y-8">
          {PARTNER_LOGOS.map(({ id, Logo }) => (
            <li key={id} className="flex h-10 w-full max-w-[9rem] items-center justify-center sm:w-auto sm:max-w-none">
              <Logo className="h-7 max-w-full text-slate-500 grayscale opacity-75 transition-opacity hover:opacity-100 sm:h-8" />
            </li>
          ))}
        </ul>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          {features.map(({ id, icon: Icon, title, desc }) => (
            <article
              key={id}
              className={cn(
                "group rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-300",
                "hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-md",
              )}
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand transition-transform group-hover:scale-105">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
