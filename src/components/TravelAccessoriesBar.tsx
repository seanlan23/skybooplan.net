import type { ReactNode } from "react";
import { Shield } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const BADGE_CLASS =
  "inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-sm shadow-sm transition-all cursor-pointer hover:scale-105 hover:border-blue-500";

const DISCOUNT_CLASS =
  "rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700";

function AiraloLogo() {
  return (
    <svg viewBox="0 0 80 20" className="h-4 w-auto shrink-0" aria-hidden role="img">
      <circle cx="10" cy="10" r="8" fill="#FF5A5F" />
      <path
        d="M7 12.5c1.2 1.5 3.2 2.2 5.2 1.8 1.4-.3 2.5-1.2 3-2.5"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <text x="22" y="14" fill="#1e293b" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">
        airalo
      </text>
    </svg>
  );
}

function HolaflyLogo() {
  return (
    <svg viewBox="0 0 88 20" className="h-4 w-auto shrink-0" aria-hidden role="img">
      <defs>
        <linearGradient id="holafly-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <rect x="0" y="2" width="16" height="16" rx="4" fill="url(#holafly-grad)" />
      <text x="5" y="14" fill="#fff" fontSize="10" fontWeight="800" fontFamily="system-ui, sans-serif">
        H
      </text>
      <text x="22" y="14" fill="#1e293b" fontSize="11" fontWeight="700" fontFamily="system-ui, sans-serif">
        holafly
      </text>
    </svg>
  );
}

function DiscountTag({ label }: { label: string }) {
  return <span className={DISCOUNT_CLASS}>{label}</span>;
}

type AccessoryLink = {
  href: string;
  labelKey: "accessories.airalo" | "accessories.holafly" | "accessories.insurance";
  discountKey?: "accessories.discount10" | "accessories.discount5";
  logo?: ReactNode;
  icon?: ReactNode;
};

const ACCESSORIES: AccessoryLink[] = [
  {
    href: "https://www.airalo.com/",
    labelKey: "accessories.airalo",
    discountKey: "accessories.discount10",
    logo: <AiraloLogo />,
  },
  {
    href: "https://holafly.com/",
    labelKey: "accessories.holafly",
    discountKey: "accessories.discount5",
    logo: <HolaflyLogo />,
  },
  {
    href: "https://www.google.com/search?q=travel+insurance+abroad",
    labelKey: "accessories.insurance",
    icon: <Shield className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />,
  },
];

export function TravelAccessoriesBar() {
  const { t } = useI18n();

  return (
    <div className="mt-8 border-t border-slate-100 pt-6">
      <span className="mb-3 block text-left text-xs font-medium uppercase tracking-wider text-slate-400">
        {t("accessories.sectionTitle")}
      </span>
      <div className="flex flex-wrap items-center justify-start gap-3">
        {ACCESSORIES.map((item) => (
          <a
            key={item.labelKey}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className={BADGE_CLASS}
          >
            {item.logo}
            {item.icon}
            <span className="font-medium text-slate-700">{t(item.labelKey)}</span>
            {item.discountKey ? <DiscountTag label={t(item.discountKey)} /> : null}
          </a>
        ))}
      </div>
    </div>
  );
}
