/** Stripe Payment Link URLs — paste your live links here when ready. */
export const STRIPE_LINK_10 = "";
export const STRIPE_LINK_20 = "";
export const STRIPE_LINK_50 = "";
export const STRIPE_LINK_CUSTOM = "";

export type SupportTier = {
  id: string;
  amountLabel: string;
  labelKey: "support.tier10" | "support.tier20" | "support.tier50" | "support.tierCustom";
  emoji: string;
  href: string;
};

export const SUPPORT_TIERS: SupportTier[] = [
  {
    id: "tier-10",
    amountLabel: "10 €",
    labelKey: "support.tier10",
    emoji: "⚡",
    href: STRIPE_LINK_10,
  },
  {
    id: "tier-20",
    amountLabel: "20 €",
    labelKey: "support.tier20",
    emoji: "🔒",
    href: STRIPE_LINK_20,
  },
  {
    id: "tier-50",
    amountLabel: "50 €",
    labelKey: "support.tier50",
    emoji: "🚀",
    href: STRIPE_LINK_50,
  },
  {
    id: "tier-custom",
    amountLabel: "support.amountCustom",
    labelKey: "support.tierCustom",
    emoji: "🎯",
    href: STRIPE_LINK_CUSTOM,
  },
];
