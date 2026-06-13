import { Plane, MapPin, FileText, Heart, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type FeatureItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  colSpan: string;
  featured?: boolean;
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
        colSpan: "md:col-span-2",
        featured: true,
      },
      {
        id: "flights",
        icon: Plane,
        title: t("feat.flights.title"),
        desc: t("feat.flights.desc"),
        colSpan: "md:col-span-1",
      },
      {
        id: "pdf",
        icon: FileText,
        title: t("feat.pdf.title"),
        desc: t("feat.pdf.desc"),
        colSpan: "md:col-span-1",
      },
      {
        id: "free",
        icon: Heart,
        title: t("feat.free.title"),
        desc: t("feat.free.desc"),
        colSpan: "md:col-span-1",
      },
    ],
    [lang, t],
  );

  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {features.map(({ id, icon: Icon, title, desc, colSpan, featured }) => (
          <div
            key={id}
            className={cn(
              "group rounded-2xl border border-slate-100 bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-md",
              colSpan,
              featured && "bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-8 md:min-h-[220px]",
            )}
          >
            <div
              className={cn(
                "mb-4 flex items-center justify-center rounded-2xl bg-brand-soft text-brand transition-transform group-hover:scale-110",
                featured ? "h-14 w-14" : "h-12 w-12",
              )}
            >
              <Icon className={featured ? "h-7 w-7" : "h-6 w-6"} />
            </div>
            <h3 className={cn("font-semibold text-foreground", featured ? "text-xl" : "text-lg")}>
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
