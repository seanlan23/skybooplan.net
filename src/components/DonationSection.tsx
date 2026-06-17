import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { DONATION_TIERS } from "@/lib/donationLinks";

const tierButtonClass =
  "inline-flex min-h-[2.75rem] items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

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
      className="relative overflow-hidden border-y border-white/10 bg-slate-950 py-14 sm:py-16"
      aria-labelledby="donation-heading"
    >
      <div className="mx-auto max-w-4xl px-6">
        <div className="rounded-2xl border border-white/20 bg-white/10 p-6 text-center shadow-lg backdrop-blur-md sm:p-8">
          <h2
            id="donation-heading"
            className="text-xl font-bold text-white sm:text-2xl"
          >
            {t("donation.title" as never)}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-white/75 sm:text-base">
            {t("donation.subtitle" as never)}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-center">
            {DONATION_TIERS.map((tier) => {
              const label =
                tier.label === "contact"
                  ? t("donation.contact" as never)
                  : tier.label;

              return (
                <DonationButton
                  key={tier.id}
                  label={label}
                  href={tier.href}
                  external={tier.external}
                  fullWidthMobile={tier.fullWidthMobile}
                />
              );
            })}
          </div>

          <p className="mt-5 text-center text-xs text-white/40">
            {t("donation.stripeNote" as never)}
          </p>
        </div>
      </div>
    </section>
  );
}
