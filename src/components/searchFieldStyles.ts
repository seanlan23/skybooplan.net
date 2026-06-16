import { cn } from "@/lib/utils";

/**
 * Shared search CTA blue — matches hero "Išči →" (#2563eb / #1d4ed8 hover).
 * Defined in src/styles.css as --search-cta / --search-cta-hover.
 */
export const SEARCH_CTA_BG = "bg-search-cta";
export const SEARCH_CTA_HOVER = "hover:bg-search-cta-hover";
export const SEARCH_CTA_TEXT = "text-white";

export const SEARCH_CTA_BUTTON = cn(
  SEARCH_CTA_BG,
  SEARCH_CTA_HOVER,
  SEARCH_CTA_TEXT,
);

/** Primary CTA — same blue pill as hero "Search →" button. */
export const SEARCH_PRIMARY_BTN = cn(
  "inline-flex items-center justify-center gap-2 rounded-full px-5",
  SEARCH_CTA_BUTTON,
  "text-sm font-semibold shadow-xl",
  "transition-colors",
  "disabled:cursor-not-allowed disabled:opacity-60",
);

/** Active tab / pill — identical fill to hero button. */
export const SEARCH_TAB_ACTIVE = cn(SEARCH_CTA_BG, SEARCH_CTA_TEXT, "shadow-md");

export const SEARCH_TAB_INACTIVE =
  "text-muted-foreground hover:bg-slate-100 hover:text-foreground";

/** Selected option in popovers. */
export const SEARCH_OPTION_ACTIVE = "bg-blue-50 font-semibold text-blue-700";

/** Shared search-form field chrome — aligned with hero input styling. */
export const FIELD_SHELL = cn(
  "flex h-full min-h-[76px] flex-col justify-center rounded-xl border border-border/80",
  "bg-white px-4 py-2.5 shadow-sm transition-colors",
  "hover:border-blue-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100",
);

export const FIELD_LABEL =
  "mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-none";

/** Icon + value row — icons sit in a fixed 20×20 slot for vertical alignment. */
export const FIELD_VALUE_ROW = "flex min-h-[24px] items-center gap-2.5";

export const FIELD_ICON_SLOT =
  "flex h-5 w-5 shrink-0 items-center justify-center self-center";

export const FIELD_ICON = "h-4 w-4 shrink-0 text-muted-foreground";

export const FIELD_INPUT =
  "min-w-0 flex-1 bg-transparent text-[15px] font-medium leading-snug text-foreground placeholder:text-muted-foreground/60 focus:outline-none";

export const FIELD_TEXT =
  "min-w-0 flex-1 truncate text-[15px] font-medium leading-snug text-foreground";

export const FIELD_SUBTEXT =
  "truncate text-xs font-normal leading-tight text-muted-foreground";
