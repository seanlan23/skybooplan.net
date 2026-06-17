export type DonationTier = {
  id: string;
  label: string;
  href: string;
  external?: boolean;
  /** Full width on mobile grid (2x2 + 1 row) */
  fullWidthMobile?: boolean;
};

export const DONATION_TIERS: DonationTier[] = [
  {
    id: "5",
    label: "☕ 5€",
    href: "https://buy.stripe.com/dRmeVd9zp1iZ48Ggdn6J204",
    external: true,
  },
  {
    id: "10",
    label: "🍕 10€",
    href: "https://buy.stripe.com/8x228r8vl7HndJg3qB6J203",
    external: true,
  },
  {
    id: "15",
    label: "🎯 15€",
    href: "https://buy.stripe.com/14AfZh5j9d1H20yf9j6J202",
    external: true,
  },
  {
    id: "50",
    label: "🚀 50€",
    href: "https://buy.stripe.com/fZucN5bHx8LrfRo7GR6J205",
    external: true,
  },
  {
    id: "contact",
    label: "contact",
    href: "/about",
    fullWidthMobile: true,
  },
];
