import { Heart } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { DONATION_TIERS } from "@/lib/donationLinks";

const btnClass =
  "inline-flex min-h-[2.5rem] items-center justify-center rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-800 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300";

/** Compact donation reminder for the authenticated dashboard (light theme). */
export function DashboardDonateCard() {
  const { t } = useI18n();

  return (
    <section
      className="rounded-[28px] border border-sky-200/70 bg-gradient-to-br from-sky-50/90 via-white to-amber-50/50 px-6 py-7 shadow-[0_12px_30px_rgba(2,132,199,0.06)] sm:px-8"
      aria-labelledby="dashboard-donation-heading"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-xl">
          <div className="mb-2 inline-flex items-center gap-2 text-sky-600">
            <Heart className="h-4 w-4 fill-sky-500/20" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em]">
              {t("dashboard.donationBadge" as never)}
            </span>
          </div>
          <h2
            id="dashboard-donation-heading"
            className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
          >
            {t("dashboard.donationTitle" as never)}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {t("dashboard.donationHint" as never)}
          </p>
        </div>

        <div className="grid w-full max-w-sm grid-cols-3 gap-2 sm:max-w-none sm:pt-1">
          {DONATION_TIERS.filter((tier) => !tier.fullWidthMobile).map((tier) => {
            const label = t(tier.labelKey as never);
            if (tier.external) {
              return (
                <a
                  key={tier.id}
                  href={tier.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(btnClass, "w-full px-2")}
                >
                  {label}
                </a>
              );
            }
            return (
              <Link key={tier.id} to={tier.href} className={cn(btnClass, "w-full px-2")}>
                {label}
              </Link>
            );
          })}
          {DONATION_TIERS.filter((tier) => tier.fullWidthMobile).map((tier) => {
            const label = t(tier.labelKey as never);
            return (
              <Link
                key={tier.id}
                to={tier.href}
                className={cn(btnClass, "col-span-3 w-full")}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
      <p className="mt-4 text-[11px] tracking-wide text-slate-400">
        {t("donation.stripeNote" as never)}
      </p>
    </section>
  );
}
