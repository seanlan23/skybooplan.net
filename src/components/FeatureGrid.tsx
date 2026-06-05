import { Plane, MapPin, FileText, CreditCard } from "lucide-react";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";

export function FeatureGrid() {
  const { t, lang } = useI18n();
  const features = useMemo(() => [
    { icon: Plane, title: t("feat.flights.title"), desc: t("feat.flights.desc") },
    { icon: MapPin, title: t("feat.itin.title"), desc: t("feat.itin.desc") },
    { icon: FileText, title: t("feat.pdf.title"), desc: t("feat.pdf.desc") },
    { icon: CreditCard, title: t("feat.price.title"), desc: t("feat.price.desc") },
  ], [lang, t]);
  return (
    <section className="mx-auto max-w-7xl px-6 py-20">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {features.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="group rounded-3xl border border-border bg-card p-6 hover:shadow-[var(--shadow-card)] hover:-translate-y-1 transition-all">
            <div className="h-12 w-12 rounded-2xl bg-brand-soft flex items-center justify-center text-brand mb-4 group-hover:scale-110 transition-transform">
              <Icon className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
