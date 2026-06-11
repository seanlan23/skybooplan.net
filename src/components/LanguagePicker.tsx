import { useState, useRef, useEffect } from "react";
import { Globe, Check } from "lucide-react";
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

export const DEFAULT_LANGUAGE = "sl";

export function getLanguageByCode(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

export function getLanguageName(code: string): string {
  return getLanguageByCode(code)?.label ?? code;
}

export function LanguagePicker({
  value,
  onChange,
  compact = false,
}: {
  value?: string;
  onChange?: (code: string) => void;
  compact?: boolean;
} = {}) {
  const i18n = useI18n();
  const current = value ?? i18n.lang;
  const handleChange = (code: string) => {
    onChange?.(code);
    i18n.setLang(code as typeof i18n.lang);
  };
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = getLanguageByCode(current);

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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center shrink-0 rounded-full text-sm font-medium transition-all border",
          compact ? "gap-1.5 px-2.5 py-1" : "gap-2 px-3 py-1.5",
          open
            ? "border-brand bg-brand/10 text-brand"
            : "border-border bg-card text-foreground hover:border-brand/40"
        )}
      >
        {!compact && <Globe className="h-3.5 w-3.5" />}
        <span className="text-base leading-none">{selected?.flag}</span>
        <span className="font-semibold tracking-wide">{selected?.code.toUpperCase()}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-border bg-white shadow-xl p-1.5 max-h-72 overflow-y-auto">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                handleChange(lang.code);
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                current === lang.code
                  ? "bg-brand/10 text-brand font-semibold"
                  : "text-foreground hover:bg-muted"
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">{lang.flag}</span>
                <span>{lang.native}</span>
                <span className="text-muted-foreground text-xs uppercase">{lang.code}</span>
              </span>
              {current === lang.code && <Check className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
