import { Plane, MapPin, FileText, Heart, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type FeatureItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
};

export function FeatureGrid() {
  const { t, lang } = useI18n();
  const features = useMemo<FeatureItem[]>(
    () => [
      {
        id: "itin",
        icon: MapPin,
        title: t("feat.itin.title"),
        desc: t("feat.itin.desc"),
      },
      {
        id: "flights",
        icon: Plane,
        title: t("feat.flights.title"),
        desc: t("feat.flights.desc"),
      },
      {
        id: "pdf",
        icon: FileText,
        title: t("feat.pdf.title"),
        desc: t("feat.pdf.desc"),
      },
      {
        id: "free",
        icon: Heart,
        title: t("feat.free.title"),
        desc: t("feat.free.desc"),
      },
    ],
    [lang, t],
  );

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
        {features.map(({ id, icon: Icon, title, desc }) => (
          <article
            key={id}
            className={cn(
              "group flex h-full min-h-[180px] flex-col rounded-2xl border border-slate-100 bg-card p-5 transition-all duration-300",
              "hover:-translate-y-1 hover:shadow-md md:p-6",
            )}
          >
            <div className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand transition-transform group-hover:scale-110">
              <Icon className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="text-base font-semibold text-foreground md:text-lg">{title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
