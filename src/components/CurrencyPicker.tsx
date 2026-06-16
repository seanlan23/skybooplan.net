import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { PlanCurrency } from "@/lib/planCurrency";

const OPTIONS: { code: PlanCurrency; symbol: string; label: string }[] = [
  { code: "EUR", symbol: "€", label: "EUR" },
  { code: "USD", symbol: "$", label: "USD" },
];

export function CurrencyPicker({ variant = "default" }: { variant?: "default" | "hero" }) {
  const { currency, setCurrency } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = OPTIONS.find((o) => o.code === currency) ?? OPTIONS[0]!;
  const isHero = variant === "hero";

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Currency: ${active.code}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex items-center gap-0.5 border-0 bg-transparent p-0 text-sm font-medium transition-colors",
          isHero ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span aria-hidden>{active.symbol}</span>
        <ChevronDown
          className={cn("h-3 w-3 opacity-60 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Currency"
          className="absolute right-0 top-full z-50 mt-2 min-w-[7rem] rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.code}
              type="button"
              role="option"
              aria-selected={currency === opt.code}
              onClick={() => {
                setCurrency(opt.code);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-sm transition-colors",
                currency === opt.code
                  ? "bg-brand/10 font-medium text-brand"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <span>
                {opt.symbol} {opt.label}
              </span>
              {currency === opt.code ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
