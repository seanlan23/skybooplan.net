import { CreditCard } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { SUPPORT_TIERS } from "@/lib/supportLinks";
import { useI18n } from "@/lib/i18n";

function ApplePayMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 20" className="h-3.5 w-auto opacity-70" fill="currentColor">
      <path d="M8.2 3.5c-.5.6-1.3 1.1-2.1 1-.1-.8.3-1.6.7-2.1.5-.6 1.3-1.1 2-1.1.1.8-.2 1.6-.6 2.2zm.6 1c-1.1-.1-2 .7-2.5.7s-1.3-.7-2.2-.7c-1.1 0-2.2.7-2.8 1.7-1.2 2.1-.3 5.2.8 6.9.6.8 1.2 1.7 2.1 1.7.9 0 1.2-.6 2.3-.6 1.1 0 1.4.6 2.3.6.9 0 1.5-.8 2.1-1.6.7-.9 1-1.9 1-1.9s-2-.8-2-3.1c0-2 1.6-2.9 1.7-3-1-.6-2.4-1.6-2.4-3.6 0-1.9 1.5-2.8 1.8-3.1zM16.5 4.8v10.4h1.8v-3.6c.5.7 1.2 1.2 2.2 1.2 1.8 0 3.1-1.4 3.1-4s-1.3-4-3.1-4c-1 0-1.7.5-2.2 1.2V4.8h-1.8zm1.8 5.8c0-1.3.8-2.2 2-2.2s2 1 2 2.2-.8 2.2-2 2.2-2-1-2-2.2zm8.2-5.8l2.4 7.3 2.4-7.3h1.9l-3.5 10.4h-1.7l-3.5-10.4h1.9zm9.8 0c2.2 0 3.6 1.4 3.6 3.6v6.8h-1.8v-1.2c-.5.9-1.4 1.4-2.6 1.4-1.8 0-3-1.2-3-2.8 0-1.7 1.3-2.8 3.6-2.8h1.7v-.4c0-1.1-.7-1.8-1.9-1.8-1.1 0-1.8.5-2 1.3h-1.7c.2-1.5 1.5-2.5 3.1-2.5zm.1 5.5c-1.3 0-2 .6-2 1.5 0 .9.7 1.4 1.8 1.4 1.4 0 2.2-.9 2.2-2.3v-.6h-2z" />
    </svg>
  );
}

function GooglePayMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 20" className="h-3.5 w-auto opacity-80">
      <path fill="#5F6368" d="M21.5 10.2v3.5h-1.2V4.8h3.2c.8 0 1.5.3 2 .8.5.5.8 1.2.8 2s-.3 1.5-.8 2c-.5.5-1.2.8-2 .8h-2zm0-4.1v3h2c.5 0 .9-.2 1.2-.5.3-.3.5-.7.5-1.2s-.2-.9-.5-1.2c-.3-.3-.7-.5-1.2-.5h-2z" />
      <path fill="#4285F4" d="M30.2 7.1c1 0 1.8.3 2.4.8.6.5 1 1.3 1 2.2 0 1-.4 1.7-1 2.3-.6.5-1.4.8-2.4.8-1 0-1.8-.3-2.4-.8-.6-.6-1-1.3-1-2.3 0-1 .3-1.7 1-2.3.6-.5 1.4-.8 2.4-.8zm0 1c-.6 0-1.1.2-1.5.6-.4.4-.6.9-.6 1.5s.2 1.1.6 1.5c.4.4.9.6 1.5.6s1.1-.2 1.5-.6c.4-.4.6-.9.6-1.5s-.2-1.1-.6-1.5c-.4-.4-.9-.6-1.5-.6z" />
      <path fill="#34A853" d="M38.8 7.3l-3.4 3.4 3.4 3.4h-1.6l-2.6-2.6-2.6 2.6h-1.6l3.4-3.4-3.4-3.4h1.6l2.6 2.6 2.6-2.6h1.6z" />
    </svg>
  );
}

function PaymentMethodsRow() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1 text-slate-400">
      <span className="text-[11px] font-medium tracking-wide">{t("support.paymentsAccepted")}</span>
      <div className="flex items-center gap-2.5">
        <ApplePayMark />
        <GooglePayMark />
        <CreditCard className="h-3.5 w-3.5 opacity-60" aria-hidden />
        <span className="text-[11px] font-medium text-slate-500">{t("support.cards")}</span>
      </div>
    </div>
  );
}

const tierButtonClass =
  "group inline-flex min-h-[2.75rem] min-w-[4.75rem] flex-col items-center justify-center gap-0.5 rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-center shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 focus-visible:ring-offset-2";

export function SupportCard({ isGenerating }: { isGenerating: boolean }) {
  const { t } = useI18n();

  if (isGenerating) return null;

  const paragraphs = t("support.body").split("\n\n");

  return (
    <section
      aria-labelledby="support-card-title"
      className="rounded-2xl border border-slate-100 bg-slate-50/70 px-5 py-5 shadow-sm sm:rounded-3xl sm:px-7 sm:py-6"
    >
      <div className="mx-auto max-w-2xl space-y-5 text-center">
        <h3
          id="support-card-title"
          className="text-base font-semibold leading-snug text-slate-900 sm:text-lg"
        >
          {t("support.title")}
        </h3>

        <div className="space-y-3 text-sm leading-relaxed text-slate-600">
          {paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
        </div>

        <div className="flex flex-wrap items-stretch justify-center gap-3">
          {SUPPORT_TIERS.map((tier) => {
            const amount =
              tier.amountLabel === "support.amountCustom"
                ? t("support.amountCustom")
                : tier.amountLabel;
            const isCustom = tier.id === "tier-custom";
            const className = `${tierButtonClass}${isCustom ? " min-w-[7.5rem] px-5" : ""}`;
            const label = (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{amount}</span>
                  <span className="text-[10px] opacity-35" aria-hidden>
                    {tier.emoji}
                  </span>
                </span>
                <span className="sr-only">{t(tier.labelKey)}</span>
              </>
            );

            if (tier.external === false) {
              return (
                <Link
                  key={tier.id}
                  to={tier.href}
                  title={t(tier.labelKey)}
                  className={className}
                >
                  {label}
                </Link>
              );
            }

            return (
              <a
                key={tier.id}
                href={tier.href}
                target="_blank"
                rel="noopener noreferrer"
                title={t(tier.labelKey)}
                className={className}
              >
                {label}
              </a>
            );
          })}
        </div>

        <PaymentMethodsRow />
      </div>
    </section>
  );
}
