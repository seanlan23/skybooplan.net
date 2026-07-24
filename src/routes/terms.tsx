import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Scale } from "lucide-react";
import { readStoredLang, translate, useT } from "@/lib/i18n";

export const Route = createFileRoute("/terms")({
  head: () => {
    const lang = readStoredLang();
    const title = translate(lang, "terms.title");
    const body = translate(lang, "terms.body");
    return {
      meta: [
        { title: `${title} — Skybooplan` },
        { name: "description", content: body },
        { property: "og:title", content: `${title} — Skybooplan` },
        { property: "og:description", content: body },
      ],
    };
  },
  component: TermsPage,
});

function TermsPage() {
  const t = useT();
  const importantPoints = t("terms.important")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("legal.backHome")}
        </Link>

        <div className="rounded-3xl border border-border bg-card p-8 md:p-12 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-brand-soft flex items-center justify-center text-brand">
              <Scale className="h-5 w-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {t("terms.title")}
            </h1>
          </div>

          <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed space-y-6">
            <p>{t("terms.intro")}</p>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground !mt-0">
                {t("terms.importantTitle")}
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                {importantPoints.map((point) => (
                  <li key={point.slice(0, 48)}>{point}</li>
                ))}
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground !mt-0">
                {t("terms.liabilityTitle")}
              </h2>
              <p>{t("terms.liability")}</p>
            </section>

            <p className="text-xs pt-2 border-t border-border">
              © {new Date().getFullYear()} Skybooplan. {t("footer.rights")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
