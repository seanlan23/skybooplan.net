import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export type Language = {
  code: string;
  label: string;
  native: string;
  flag: string;
};

export const LANGUAGES: Language[] = [
  { code: "sl", label: "Slovenščina", native: "Slovenščina", flag: "🇸🇮" },
  { code: "en", label: "English", native: "English", flag: "🇬🇧" },
  { code: "es", label: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "fr", label: "French", native: "Français", flag: "🇫🇷" },
  { code: "it", label: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "de", label: "German", native: "Deutsch", flag: "🇩🇪" },
];

export const DEFAULT_LANGUAGE = "en";

export function getLanguageByCode(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

export function getLanguageName(code: string): string {
  return getLanguageByCode(code)?.label ?? code;
}

export function LanguagePicker({
  value,
  onChange,
  variant = "default",
}: {
  value?: string;
  onChange?: (code: string) => void;
  variant?: "default" | "hero";
} = {}) {
  const i18n = useI18n();
  const current = value ?? i18n.lang;
  const handleChange = (code: string) => {
    onChange?.(code);
    i18n.setLang(code as typeof i18n.lang);
  };
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
        aria-label="Language"
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex items-center gap-0.5 border-0 bg-transparent p-0 text-sm font-medium transition-colors",
          isHero ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span className="text-base leading-none" aria-hidden>
          🌐
        </span>
        <ChevronDown
          className={cn("h-3 w-3 opacity-60 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-border bg-card py-1 shadow-lg max-h-72 overflow-y-auto">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="option"
              aria-selected={current === lang.code}
              onClick={() => {
                handleChange(lang.code);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2 text-sm transition-colors",
                current === lang.code
                  ? "bg-brand/10 font-medium text-brand"
                  : "text-foreground hover:bg-muted",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">{lang.flag}</span>
                <span>{lang.native}</span>
              </span>
              {current === lang.code ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
