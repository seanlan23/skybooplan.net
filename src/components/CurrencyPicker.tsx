import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { PlanCurrency } from "@/lib/planCurrency";

const OPTIONS: { code: PlanCurrency; label: string }[] = [
  { code: "EUR", label: "€ EUR" },
  { code: "USD", label: "$ USD" },
];

export function CurrencyPicker() {
  const { currency, setCurrency } = useI18n();

  return (
    <div
      className="inline-flex items-center rounded-full border border-border bg-card p-0.5 text-xs font-semibold"
      role="group"
      aria-label="Currency"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.code}
          type="button"
          onClick={() => setCurrency(opt.code)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors",
            currency === opt.code
              ? "bg-brand/10 text-brand"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Coins className="h-3 w-3 opacity-70" aria-hidden />
          {opt.label}
        </button>
      ))}
    </div>
  );
}
