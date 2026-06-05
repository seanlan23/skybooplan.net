import { useMemo } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useStripeCheckout } from "@/hooks/useStripeCheckout";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

type Plan = {
  id: "one_time" | "monthly" | "annual";
  priceId: "single_plan_eur" | "monthly_eur" | "annual_eur";
  name: string;
  price: string;
  per: string;
  badge?: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
};


export function PricingSection() {
  const { openCheckout, closeCheckout, isOpen, checkoutElement } = useStripeCheckout();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, lang } = useI18n();

  const PLANS: Plan[] = useMemo(
    () => [
      {
        id: "one_time" as const,
        priceId: "single_plan_eur" as const,
        name: t("pricing.singleName"),
        price: "€3.90",
        per: t("pricing.perTrip"),
        features: [t("pricing.feat.aiPlan"), t("pricing.feat.pdf"), t("pricing.feat.payOnce")],
        cta: t("pricing.ctaSingle"),
      },
      {
        id: "monthly" as const,
        priceId: "monthly_eur" as const,
        name: t("pricing.monthlyName"),
        price: "€7.90",
        per: t("pricing.perMonth"),
        badge: t("pricing.mostFlexible"),
        features: [t("pricing.feat.twoPerDay"), t("pricing.feat.pdfEach"), t("pricing.feat.cancelAnytime")],
        cta: t("pricing.ctaMonthly"),
        highlighted: true,
      },
      {
        id: "annual" as const,
        priceId: "annual_eur" as const,
        name: t("pricing.annualName"),
        price: "€46.80",
        per: t("pricing.perYear"),
        badge: t("pricing.save48"),
        features: [t("pricing.feat.twoPerDay"), t("pricing.feat.pdfEach"), t("pricing.feat.equivalent")],
        cta: t("pricing.ctaAnnual"),
      },
    ],
    [lang, t],
  );

  const handlePlan = (plan: Plan) => {
    if (!user) {
      try {
        sessionStorage.setItem("intended_plan", plan.priceId);
      } catch {
        /* ignore */
      }
      navigate({ to: "/signup" });
      return;
    }

    openCheckout({
      priceId: plan.priceId,
      customerEmail: user.email ?? undefined,
      userId: user.id,
      returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    });
  };

  return (
    <>
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand uppercase tracking-wider mb-4">
            {t("pricing.badge")}
          </div>
          <h2 className="text-4xl sm:text-5xl font-bold text-foreground">
            {t("pricing.title1")}<br />{t("pricing.title2")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("pricing.subtitle")}
          </p>
        </div>


        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={cn(
                "relative rounded-3xl border p-8 flex flex-col bg-card shadow-[var(--shadow-card)]",
                p.highlighted ? "border-brand ring-2 ring-brand/30" : "border-border",
              )}
            >
              {p.badge && (
                <span
                  className={cn(
                    "absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold",
                    p.highlighted ? "text-primary-foreground [background:var(--gradient-warm)]" : "bg-muted text-foreground border border-border",
                  )}
                >
                  {p.badge}
                </span>
              )}

              <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-5xl font-bold text-foreground">{p.price}</span>
                <span className="text-muted-foreground">{p.per}</span>
              </div>

              <ul className="mt-6 space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-foreground/80">
                    <Check className="h-5 w-5 text-brand mt-0.5 shrink-0" />
                    <span className="text-sm">{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handlePlan(p)}
                className={cn(
                  "mt-8 w-full inline-flex items-center justify-center rounded-2xl py-3 font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]",
                  p.highlighted
                    ? "text-primary-foreground shadow-md hover:shadow-lg [background:var(--gradient-warm)]"
                    : "bg-card text-foreground border border-border hover:border-brand/50",
                )}
              >
                {p.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          {t("pricing.note")}
        </p>
      </section>

      <Dialog open={isOpen} onOpenChange={(open) => !open && closeCheckout()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogTitle className="sr-only">Checkout</DialogTitle>
          <div className="p-2">{checkoutElement}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
