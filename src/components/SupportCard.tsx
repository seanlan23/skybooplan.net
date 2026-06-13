import { CreditCard, Heart } from "lucide-react";
import { SUPPORT_TIERS } from "@/lib/supportLinks";
import { useI18n } from "@/lib/i18n";

function ApplePayMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 20" className="h-4 w-auto" fill="currentColor">
      <path d="M8.2 3.5c-.5.6-1.3 1.1-2.1 1-.1-.8.3-1.6.7-2.1.5-.6 1.3-1.1 2-1.1.1.8-.2 1.6-.6 2.2zm.6 1c-1.1-.1-2 .7-2.5.7s-1.3-.7-2.2-.7c-1.1 0-2.2.7-2.8 1.7-1.2 2.1-.3 5.2.8 6.9.6.8 1.2 1.7 2.1 1.7.9 0 1.2-.6 2.3-.6 1.1 0 1.4.6 2.3.6.9 0 1.5-.8 2.1-1.6.7-.9 1-1.9 1-1.9s-2-.8-2-3.1c0-2 1.6-2.9 1.7-3-1-.6-2.4-1.6-2.4-3.6 0-1.9 1.5-2.8 1.8-3.1zM16.5 4.8v10.4h1.8v-3.6c.5.7 1.2 1.2 2.2 1.2 1.8 0 3.1-1.4 3.1-4s-1.3-4-3.1-4c-1 0-1.7.5-2.2 1.2V4.8h-1.8zm1.8 5.8c0-1.3.8-2.2 2-2.2s2 1 2 2.2-.8 2.2-2 2.2-2-1-2-2.2zm8.2-5.8l2.4 7.3 2.4-7.3h1.9l-3.5 10.4h-1.7l-3.5-10.4h1.9zm9.8 0c2.2 0 3.6 1.4 3.6 3.6v6.8h-1.8v-1.2c-.5.9-1.4 1.4-2.6 1.4-1.8 0-3-1.2-3-2.8 0-1.7 1.3-2.8 3.6-2.8h1.7v-.4c0-1.1-.7-1.8-1.9-1.8-1.1 0-1.8.5-2 1.3h-1.7c.2-1.5 1.5-2.5 3.1-2.5zm.1 5.5c-1.3 0-2 .6-2 1.5 0 .9.7 1.4 1.8 1.4 1.4 0 2.2-.9 2.2-2.3v-.6h-2z" />
    </svg>
  );
}

function GooglePayMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 20" className="h-4 w-auto">
      <path fill="#5F6368" d="M21.5 10.2v3.5h-1.2V4.8h3.2c.8 0 1.5.3 2 .8.5.5.8 1.2.8 2s-.3 1.5-.8 2c-.5.5-1.2.8-2 .8h-2zm0-4.1v3h2c.5 0 .9-.2 1.2-.5.3-.3.5-.7.5-1.2s-.2-.9-.5-1.2c-.3-.3-.7-.5-1.2-.5h-2z" />
      <path fill="#4285F4" d="M30.2 7.1c1 0 1.8.3 2.4.8.6.5 1 1.3 1 2.2 0 1-.4 1.7-1 2.3-.6.5-1.4.8-2.4.8-1 0-1.8-.3-2.4-.8-.6-.6-1-1.3-1-2.3 0-1 .3-1.7 1-2.3.6-.5 1.4-.8 2.4-.8zm0 1c-.6 0-1.1.2-1.5.6-.4.4-.6.9-.6 1.5s.2 1.1.6 1.5c.4.4.9.6 1.5.6s1.1-.2 1.5-.6c.4-.4.6-.9.6-1.5s-.2-1.1-.6-1.5c-.4-.4-.9-.6-1.5-.6z" />
      <path fill="#34A853" d="M38.8 7.3l-3.4 3.4 3.4 3.4h-1.6l-2.6-2.6-2.6 2.6h-1.6l3.4-3.4-3.4-3.4h1.6l2.6 2.6 2.6-2.6h1.6z" />
    </svg>
  );
}

function PaymentMethodsRow() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-slate-500">
      <span className="text-[11px] font-medium uppercase tracking-wide">{t("support.paymentsAccepted")}</span>
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
        <ApplePayMark />
        <span className="h-3 w-px bg-slate-200" aria-hidden />
        <GooglePayMark />
        <span className="h-3 w-px bg-slate-200" aria-hidden />
        <CreditCard className="h-4 w-4" aria-hidden />
        <span className="text-xs font-medium">{t("support.cards")}</span>
      </div>
    </div>
  );
}

export function SupportCard({ isGenerating }: { isGenerating: boolean }) {
  const { t } = useI18n();

  if (isGenerating) return null;

  return (
    <section
      aria-labelledby="support-card-title"
      className="overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/60 shadow-sm"
    >
      <div className="border-b border-emerald-100/80 bg-emerald-600/90 px-4 py-3.5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
            <Heart className="h-4 w-4" aria-hidden />
          </div>
          <h3 id="support-card-title" className="text-base sm:text-lg font-bold leading-snug text-white">
            {t("support.title")}
          </h3>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
        <div className="space-y-3 text-sm leading-relaxed text-slate-600">
          {t("support.body")
            .split("\n\n")
            .map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {SUPPORT_TIERS.map((tier) => {
            const amount =
              tier.amountLabel === "support.amountCustom"
                ? t("support.amountCustom")
                : tier.amountLabel;
            return (
              <a
                key={tier.id}
                href={tier.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-h-[3.25rem] items-center gap-3 rounded-xl border border-emerald-200/80 bg-white px-3.5 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              >
                <span className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-sm font-bold tabular-nums text-white group-hover:bg-emerald-700">
                  {amount}
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-700">
                  {t(tier.labelKey)} <span aria-hidden>{tier.emoji}</span>
                </span>
              </a>
            );
          })}
        </div>

        <PaymentMethodsRow />
      </div>
    </section>
  );
}
