/**
 * Timezone-safe date helpers.
 *
 * Background: `new Date("2026-07-10")` is parsed as UTC midnight, so in any
 * timezone west of UTC+0 it shifts back one calendar day when formatted with
 * `.toLocaleDateString()`. The helpers below treat a `YYYY-MM-DD` string as a
 * **local** date and never apply a UTC shift.
 */

export function parseLocalDate(input?: string | null): Date | null {
  if (!input) return null;
  const s = String(input).slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function formatLocalDate(
  input?: string | null,
  locale: string = "sl",
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  const d = parseLocalDate(input);
  if (!d) return input ?? "";
  try {
    return d.toLocaleDateString(locale, opts);
  } catch {
    return d.toLocaleDateString();
  }
}

export function formatLocalDateRange(
  from?: string | null,
  to?: string | null,
  locale: string = "sl",
): string {
  const a = formatLocalDate(from, locale);
  const b = to ? formatLocalDate(to, locale) : "";
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

/**
 * Inclusive calendar days from START_DATE through END_DATE.
 * 17 Oct → 31 Oct is 15 days (not 13 or 14 nights). UTC date parts avoid DST drift.
 */
export function inclusiveCalendarDayCount(
  startDate: string,
  endDate: string,
): number | null {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  if (!start || !end) return null;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const nights = Math.round(Math.abs(endUtc - startUtc) / 86_400_000);
  return Math.max(1, nights + 1);
}

/** Returns YYYY-MM-DD shifted by `days`, preserving local date semantics. */
export function addDays(input: string, days: number): string {
  const d = parseLocalDate(input);
  if (!d) return input;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
