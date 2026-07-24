import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { DONATION_TIERS } from "@/lib/donationLinks";

const tierButtonClass =
  "inline-flex min-h-[2.75rem] w-full items-center justify-center whitespace-nowrap rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm font-medium tracking-wide text-white/95 transition-colors hover:border-white/30 hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30";

function DonationButton({
  label,
  href,
  external,
  className,
}: {
  label: string;
  href: string;
  external?: boolean;
  className?: string;
}) {
  const classes = cn(tierButtonClass, className);

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
      >
        {label}
      </a>
    );
  }

  return (
    <Link to={href} className={classes}>
      {label}
    </Link>
  );
}

export function DonationSection() {
  const { t } = useI18n();
  const amountTiers = DONATION_TIERS.filter((tier) => !tier.fullWidthMobile);
  const otherTier = DONATION_TIERS.find((tier) => tier.fullWidthMobile);

  return (
    <section
      className="relative overflow-hidden bg-gradient-to-b from-slate-950 to-slate-900/60 py-14 sm:py-16"
      aria-labelledby="donation-heading"
    >
      <div className="mx-auto max-w-3xl px-6">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-6 py-8 text-center sm:px-10 sm:py-10">
          <h2
            id="donation-heading"
            className="text-lg font-semibold tracking-tight text-white sm:text-xl"
          >
            {t("donation.title" as never)}
          </h2>
          <p className="mx-auto mt-2.5 max-w-md text-sm leading-relaxed text-white/60">
            {t("donation.subtitle" as never)}
          </p>

          <div className="mt-7 grid grid-cols-3 gap-2.5">
            {amountTiers.map((tier) => (
              <DonationButton
                key={tier.id}
                label={t(tier.labelKey as never)}
                href={tier.href}
                external={tier.external}
              />
            ))}
          </div>
          {otherTier ? (
            <div className="mt-2.5">
              <DonationButton
                label={t(otherTier.labelKey as never)}
                href={otherTier.href}
                external={otherTier.external}
              />
            </div>
          ) : null}

          <p className="mt-6 text-center text-[11px] tracking-wide text-white/35">
            {t("donation.stripeNote" as never)}
          </p>
        </div>
      </div>
    </section>
  );
}
