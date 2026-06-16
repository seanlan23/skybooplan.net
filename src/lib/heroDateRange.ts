import type { DateRange } from "react-day-picker";

const SL_MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  maj: 4,
  may: 4,
  jun: 5,
  jul: 6,
  avg: 7,
  aug: 7,
  sep: 8,
  okt: 9,
  oct: 9,
  nov: 10,
  dec: 11,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDayMonthWithYear(dayMonth: string, year: number, lang: string): Date | null {
  const cleaned = dayMonth.trim().replace(/\./g, "").toLowerCase();
  const match = cleaned.match(/^(\d{1,2})\s+([a-zčšž]+)/i);
  if (!match) return null;

  const day = Number.parseInt(match[1]!, 10);
  const monthToken = match[2]!.slice(0, 3).toLowerCase();

  let monthIndex: number | undefined = SL_MONTHS[monthToken];
  if (monthIndex == null && lang !== "sl") {
    const en = new Date(`${monthToken} 1, 2000`);
    if (!Number.isNaN(en.getTime())) monthIndex = en.getMonth();
  }
  if (monthIndex == null) return null;

  const d = new Date(year, monthIndex, day, 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format range like "16. jun → 23. jun 2026" (SL) or EN equivalent. */
export function formatHeroDateRangeLabel(range: DateRange, lang = "sl"): string {
  if (!range.from) return "";
  const locale = lang === "sl" ? "sl-SI" : "en-GB";
  const fmt = (d: Date) =>
    d.toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(/\.$/, "");

  if (!range.to || toIsoDate(range.from) === toIsoDate(range.to)) {
    return `${fmt(range.from)} ${range.from.getFullYear()}`;
  }

  const year = range.to.getFullYear();
  return `${fmt(range.from)} → ${fmt(range.to)} ${year}`;
}

/** Parse hero chat date label — supports range "16. jun → 23. jun 2026" or month chips. */
export function parseHeroDateRangeStart(label: string, lang = "sl"): string | null {
  const trimmed = label.trim();
  const rangeMatch = trimmed.match(/^(.+?)\s*→\s*(.+?)\s+(20\d{2})$/);
  if (rangeMatch) {
    const from = parseDayMonthWithYear(rangeMatch[1]!, Number.parseInt(rangeMatch[3]!, 10), lang);
    return from ? toIsoDate(from) : null;
  }

  const singleYear = trimmed.match(/^(.+?)\s+(20\d{2})$/);
  if (singleYear) {
    const from = parseDayMonthWithYear(singleYear[1]!, Number.parseInt(singleYear[2]!, 10), lang);
    return from ? toIsoDate(from) : null;
  }

  return null;
}

export function isCompleteDateRange(range: DateRange | undefined): range is { from: Date; to: Date } {
  return Boolean(range?.from && range?.to);
}
