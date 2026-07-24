import { Logo } from "@/components/Logo";
import { useT } from "@/lib/i18n";
import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  const t = useT();
  return (
    <footer className="border-t border-border bg-card/40 mt-10">
      <div className="mx-auto max-w-7xl px-6 py-12 grid sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div className="space-y-3">
          <Logo size="lg" showTagline />
          <p className="text-sm text-muted-foreground max-w-xs">{t("footer.tagline")}</p>
        </div>
        <FooterCol
          title={t("footer.product")}
          links={[
            { label: t("nav.flights"), to: "/" },
            { label: t("nav.stays"), to: "/" },
            { label: t("nav.ai"), to: "/" },
            { label: t("nav.myPlans"), to: "/dashboard" },
          ]}
        />
        <FooterCol
          title={t("footer.company")}
          links={[{ label: `${t("footer.about")} & ${t("footer.contact")}`, to: "/about" }]}
        />
        <FooterCol title={t("footer.legal")} links={[{ label: t("footer.terms"), to: "/terms" }, { label: `${t("footer.privacy")} & ${t("footer.cookies")}`, to: "/privacy" }, { label: t("footer.refunds"), to: "/refunds" }]} />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-6 space-y-3">
          <div className="max-w-3xl space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p className="font-semibold text-foreground/80">{t("footer.disclaimerTitle")}</p>
            <p className="whitespace-pre-line">{t("footer.disclaimer")}</p>
          </div>
          <div className="text-xs text-muted-foreground flex justify-between flex-wrap gap-2 pt-1">
            <span>© {new Date().getFullYear()} Skybooplan. {t("footer.rights")}</span>
            <span>{t("footer.made")}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; to: string }[] }) {
  return (
    <div>
      <div className="text-sm font-semibold text-foreground mb-3">{title}</div>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {links.map((l) => (
          <li key={l.label}>
            {l.to === "#" ? (
              <span className="opacity-60 cursor-default">{l.label}</span>
            ) : (
              <Link to={l.to} className="hover:text-foreground transition-colors">
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
