import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { DONATION_TIERS } from "@/lib/donationLinks";

const tierButtonClass =
  "inline-flex min-h-[2.5rem] items-center justify-center whitespace-nowrap rounded-lg border border-white/15 bg-white/[0.06] px-5 py-2.5 text-sm font-medium tracking-wide text-white/95 transition-colors hover:border-white/30 hover:bg-white/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30";

function DonationButton({
  label,
  href,
  external,
  fullWidthMobile,
}: {
  label: string;
  href: string;
  external?: boolean;
  fullWidthMobile?: boolean;
}) {
  const className = cn(
    tierButtonClass,
    fullWidthMobile ? "col-span-2 w-full sm:col-span-1 sm:w-auto" : "w-full sm:w-auto",
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {label}
      </a>
    );
  }

  return (
    <Link to={href} className={className}>
      {label}
    </Link>
  );
}

export function DonationSection() {
  const { t } = useI18n();

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

          <div className="mt-7 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-3">
            {DONATION_TIERS.map((tier) => (
              <DonationButton
                key={tier.id}
                label={t(tier.labelKey as never)}
                href={tier.href}
                external={tier.external}
                fullWidthMobile={tier.fullWidthMobile}
              />
            ))}
          </div>

          <p className="mt-6 text-center text-[11px] tracking-wide text-white/35">
            {t("donation.stripeNote" as never)}
          </p>
        </div>
      </div>
    </section>
  );
}
