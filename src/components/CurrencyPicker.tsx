import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { PlanCurrency } from "@/lib/planCurrency";

const OPTIONS: { code: PlanCurrency; label: string }[] = [
  { code: "EUR", label: "€ EUR" },
  { code: "USD", label: "$ USD" },
];

const COMPACT_OPTIONS: { code: PlanCurrency; label: string }[] = [
  { code: "EUR", label: "€" },
  { code: "USD", label: "$" },
];

export function CurrencyPicker({ compact = false }: { compact?: boolean }) {
  const { currency, setCurrency } = useI18n();
  const options = compact ? COMPACT_OPTIONS : OPTIONS;

  return (
    <div
      className="inline-flex items-center rounded-full border border-border bg-card p-0.5 text-xs font-semibold shrink-0"
      role="group"
      aria-label="Currency"
    >
      {options.map((opt) => (
        <button
          key={opt.code}
          type="button"
          onClick={() => setCurrency(opt.code)}
          aria-label={opt.code}
          className={cn(
            "inline-flex items-center gap-1 rounded-full transition-colors",
            compact ? "px-2 py-1" : "px-2.5 py-1",
            currency === opt.code
              ? "bg-brand/10 text-brand"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {!compact && <Coins className="h-3 w-3 opacity-70" aria-hidden />}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
