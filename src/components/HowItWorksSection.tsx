import { useI18n } from "@/lib/i18n";

const STEPS = [
  { n: "1", titleKey: "how.1.title", descKey: "how.1.desc" },
  { n: "2", titleKey: "how.2.title", descKey: "how.2.desc" },
  { n: "3", titleKey: "how.3.title", descKey: "how.3.desc" },
] as const;

export function HowItWorksSection() {
  const { t } = useI18n();

  return (
    <section className="border-b border-border/60 bg-slate-50/70" aria-labelledby="how-heading">
      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-12">
        <h2 id="how-heading" className="text-center text-2xl font-bold text-foreground sm:text-3xl">
          {t("how.title" as never)}
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3 sm:gap-5">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-2xl border border-border/80 bg-card px-5 py-5 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{step.n}</p>
              <h3 className="mt-2 text-base font-semibold text-foreground">
                {t(step.titleKey as never)}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {t(step.descKey as never)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
