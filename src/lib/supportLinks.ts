import { DONATION_TIERS } from "@/lib/donationLinks";

export type SupportTier = {
  id: string;
  amountLabel: string;
  labelKey:
    | "support.tier5"
    | "support.tier10"
    | "support.tier20"
    | "support.tierCustom";
  emoji: string;
  href: string;
  /** Internal app route (e.g. /about) — open in same tab. */
  external?: boolean;
};

const donationById = Object.fromEntries(DONATION_TIERS.map((t) => [t.id, t]));

/** Same Stripe amounts as homepage donations: 5 / 10 / 20 € + other. */
export const SUPPORT_TIERS: SupportTier[] = [
  {
    id: "tier-5",
    amountLabel: "5 €",
    labelKey: "support.tier5",
    emoji: "⚡",
    href: donationById["5"]!.href,
    external: true,
  },
  {
    id: "tier-10",
    amountLabel: "10 €",
    labelKey: "support.tier10",
    emoji: "☕",
    href: donationById["10"]!.href,
    external: true,
  },
  {
    id: "tier-20",
    amountLabel: "20 €",
    labelKey: "support.tier20",
    emoji: "🚀",
    href: donationById["20"]!.href,
    external: true,
  },
  {
    id: "tier-custom",
    amountLabel: "support.amountCustom",
    labelKey: "support.tierCustom",
    emoji: "🎯",
    href: donationById.contact!.href,
    external: false,
  },
];
