export type DonationTier = {
  id: string;
  labelKey:
    | "donation.tier5"
    | "donation.tier10"
    | "donation.tier50"
    | "donation.contact";
  href: string;
  external?: boolean;
  /** Full width on mobile grid */
  fullWidthMobile?: boolean;
};

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
    id: "50",
    labelKey: "donation.tier50",
    href: "https://buy.stripe.com/fZucN5bHx8LrfRo7GR6J205",
    external: true,
  },
  {
    id: "contact",
    labelKey: "donation.contact",
    href: "/about",
    fullWidthMobile: true,
  },
];
