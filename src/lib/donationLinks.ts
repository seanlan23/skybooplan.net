export type DonationTier = {
  id: string;
  labelKey:
    | "donation.tier5"
    | "donation.tier10"
    | "donation.tier20"
    | "donation.contact";
  href: string;
  external?: boolean;
  /** Full width on mobile grid */
  fullWidthMobile?: boolean;
};

/**
 * Stripe Payment Links — 5 € / 10 € / 20 € + “other” → /about.
 * 20 € link: new product/price (replaced old link that still charged €50).
 */
export const DONATION_TIERS: DonationTier[] = [
  {
    id: "5",
    labelKey: "donation.tier5",
    href: "https://buy.stripe.com/dRmeVd9zp1iZ48Ggdn6J204",
    external: true,
  },
  {
    id: "10",
    labelKey: "donation.tier10",
    href: "https://buy.stripe.com/8x228r8vl7HndJg3qB6J203",
    external: true,
  },
  {
    id: "20",
    labelKey: "donation.tier20",
    href: "https://buy.stripe.com/8x25kDaDt8Lr9t01it6J206",
    external: true,
  },
  {
    id: "contact",
    labelKey: "donation.contact",
    href: "/about",
    fullWidthMobile: true,
  },
];
