import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, Mail } from "lucide-react";
import { readStoredLang, translate, useT } from "@/lib/i18n";

export const Route = createFileRoute("/about")({
  head: () => {
    const lang = readStoredLang();
    const title = translate(lang, "about.title");
    const body = translate(lang, "about.body");
    return {
      meta: [
        { title: `${title} — Skybooplan` },
        { name: "description", content: body },
        { property: "og:title", content: `${title} — Skybooplan` },
        { property: "og:description", content: body },
      ],
    };
  },
  component: AboutPage,
});

function AboutPage() {
  const t = useT();

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
              <Building2 className="h-5 w-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {t("about.title")}
            </h1>
          </div>

          <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed space-y-4">
            <p>{t("about.body")}</p>
          </div>

          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 text-brand" />
              <a
                href="mailto:info@skybooplan.com"
                className="text-foreground hover:text-brand transition-colors"
              >
                info@skybooplan.com
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
