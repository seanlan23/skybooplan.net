import { cn } from "@/lib/utils";

/** Shared search-form field chrome — keep all row fields visually aligned. */
export const FIELD_SHELL = cn(
  "flex h-full min-h-[76px] flex-col justify-center rounded-2xl border border-border",
  "bg-background/60 px-4 py-2.5 hover:border-brand/40 transition-colors",
  "focus-within:border-brand focus-within:bg-card",
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
