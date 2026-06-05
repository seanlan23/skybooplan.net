import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { readStoredLang, translate, useT } from "@/lib/i18n";

export const Route = createFileRoute("/refunds")({
  head: () => {
    const lang = readStoredLang();
    const title = translate(lang, "refunds.title");
    const body = translate(lang, "refunds.body");
    return {
      meta: [
        { title: `${title} — Skybooplan` },
        { name: "description", content: body },
        { property: "og:title", content: `${title} — Skybooplan` },
        { property: "og:description", content: body },
      ],
    };
  },
  component: RefundsPage,
});

function RefundsPage() {
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
              <RotateCcw className="h-5 w-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {t("refunds.title")}
            </h1>
          </div>

          <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed space-y-4">
            <p>{t("refunds.body")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
