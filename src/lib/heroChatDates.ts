export type HeroChatDatePrecision = "exact" | "vague" | "none";

export type HeroChatDateParseResult = {
  precision: HeroChatDatePrecision;
  label: string;
  departDate?: string;
  returnDate?: string;
};

const MONTH_PATTERN =
  "januar|februar|marec|april|maj|junij|julij|avgust|september|oktober|november|december|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|avg|aug|sep|okt|oct|nov|dec";

const MONTH_RE = new RegExp(MONTH_PATTERN, "i");

const SL_MONTHS: Record<string, number> = {
  jan: 0,
  januar: 0,
  feb: 1,
  februar: 1,
  mar: 2,
  marec: 2,
  apr: 3,
  april: 3,
  maj: 4,
  may: 4,
  jun: 5,
  junij: 5,
  jul: 6,
  julij: 6,
  avg: 7,
  avgust: 7,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  okt: 9,
  oktober: 9,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function resolveMonthIndex(token: string): number | undefined {
  const key = token.toLowerCase().replace(/\./g, "");
  if (key in SL_MONTHS) return SL_MONTHS[key];
  const short = key.slice(0, 3);
  return SL_MONTHS[short];
}

function inferYear(monthIndex: number, reference = new Date()): number {
  const year = reference.getFullYear();
  const monthNow = reference.getMonth();
  return monthIndex < monthNow ? year + 1 : year;
}

function formatDayMonth(day: number, monthIndex: number, lang: string): string {
  const locale = lang === "sl" ? "sl-SI" : "en-GB";
  const d = new Date(2026, monthIndex, day, 12);
  return d.toLocaleDateString(locale, { day: "numeric", month: "long" });
}

function extractIsoRange(text: string): HeroChatDateParseResult | null {
  const range = text.match(
    /(20\d{2}-\d{2}-\d{2})\s*(?:to|do|–|—|-)\s*(20\d{2}-\d{2}-\d{2})/i,
  );
  if (range) {
    return {
      precision: "exact",
      label: `${range[1]} – ${range[2]}`,
      departDate: range[1],
      returnDate: range[2],
    };
  }

  const single = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (single) {
    return {
      precision: "exact",
      label: single[1]!,
      departDate: single[1],
    };
  }

  return null;
}

function extractDayRange(text: string, lang: string): HeroChatDateParseResult | null {
  const normalized = text.replace(/\s+/g, " ").trim();

  const slRange = normalized.match(
    new RegExp(
      `(?:od\\s+)?(\\d{1,2})\\.?\\s*(?:do|–|-)\\s*(\\d{1,2})\\.?\\s*(${MONTH_PATTERN})`,
      "i",
    ),
  );
  if (slRange) {
    const dayFrom = Number.parseInt(slRange[1]!, 10);
    const dayTo = Number.parseInt(slRange[2]!, 10);
    const monthIndex = resolveMonthIndex(slRange[3]!);
    if (monthIndex == null) return null;
    const year = inferYear(monthIndex);
    const label =
      lang === "sl"
        ? `${dayFrom}.–${dayTo}. ${slRange[3]!.toLowerCase()} ${year}`
        : `${formatDayMonth(dayFrom, monthIndex, lang)} – ${formatDayMonth(dayTo, monthIndex, lang)} ${year}`;
    return {
      precision: "exact",
      label,
      departDate: toIsoDate(year, monthIndex, dayFrom),
      returnDate: toIsoDate(year, monthIndex, dayTo),
    };
  }

  const arrowRange = normalized.match(
    new RegExp(
      `(\\d{1,2})\\.?\\s*(${MONTH_PATTERN})\\s*(?:→|–|-)\\s*(\\d{1,2})\\.?\\s*(${MONTH_PATTERN})(?:\\s+(20\\d{2}))?`,
      "i",
    ),
  );
  if (arrowRange) {
    const dayFrom = Number.parseInt(arrowRange[1]!, 10);
    const monthFrom = resolveMonthIndex(arrowRange[2]!);
    const dayTo = Number.parseInt(arrowRange[3]!, 10);
    const monthTo = resolveMonthIndex(arrowRange[4]!);
    if (monthFrom == null || monthTo == null) return null;
    const year = arrowRange[5]
      ? Number.parseInt(arrowRange[5], 10)
      : inferYear(Math.min(monthFrom, monthTo));
    const label =
      lang === "sl"
        ? `${dayFrom}. ${arrowRange[2]!.toLowerCase()} → ${dayTo}. ${arrowRange[4]!.toLowerCase()} ${year}`
        : `${formatDayMonth(dayFrom, monthFrom, lang)} → ${formatDayMonth(dayTo, monthTo, lang)} ${year}`;
    return {
      precision: "exact",
      label,
      departDate: toIsoDate(year, monthFrom, dayFrom),
      returnDate: toIsoDate(year, monthTo, dayTo),
    };
  }

  return null;
}

function extractSingleDay(text: string, lang: string): HeroChatDateParseResult | null {
  const normalized = text.replace(/\s+/g, " ").trim();

  const dayFirst = normalized.match(new RegExp(`\\b(\\d{1,2})\\.?\\s+(${MONTH_PATTERN})\\b`, "i"));
  if (dayFirst) {
    const day = Number.parseInt(dayFirst[1]!, 10);
    const monthIndex = resolveMonthIndex(dayFirst[2]!);
    if (monthIndex == null) return null;
    const year = inferYear(monthIndex);
    const label =
      lang === "sl"
        ? `${day}. ${dayFirst[2]!.toLowerCase()} ${year}`
        : `${formatDayMonth(day, monthIndex, lang)} ${year}`;
    return {
      precision: "exact",
      label,
      departDate: toIsoDate(year, monthIndex, day),
    };
  }

  const monthFirst = normalized.match(
    new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"),
  );
  if (monthFirst) {
    const monthIndex = resolveMonthIndex(monthFirst[1]!);
    const day = Number.parseInt(monthFirst[2]!, 10);
    if (monthIndex == null) return null;
    const year = inferYear(monthIndex);
    const label = `${formatDayMonth(day, monthIndex, lang)} ${year}`;
    return {
      precision: "exact",
      label,
      departDate: toIsoDate(year, monthIndex, day),
    };
  }

  return null;
}

function extractVague(text: string, lang: string): HeroChatDateParseResult | null {
  const normalized = text.toLowerCase();

  const relativePatterns: { re: RegExp; labelSl: string; labelEn: string }[] = [
    { re: /čez\s+(\d+)\s+tedn/i, labelSl: "čez $1 tedna", labelEn: "in $1 weeks" },
    { re: /in\s+(\d+)\s+weeks?/i, labelSl: "čez $1 tedna", labelEn: "in $1 weeks" },
    { re: /naslednji\s+teden|next\s+week/i, labelSl: "naslednji teden", labelEn: "next week" },
    { re: /konec\s+poletja|end\s+of\s+summer/i, labelSl: "konec poletja", labelEn: "end of summer" },
    { re: /poletj[ae]|summer/i, labelSl: "poletje", labelEn: "summer" },
    { re: /pozimi|zim[ae]|winter/i, labelSl: "zima", labelEn: "winter" },
    { re: /spomladi|spring/i, labelSl: "spomlad", labelEn: "spring" },
    { re: /jeseni|autumn|fall/i, labelSl: "jesen", labelEn: "autumn" },
  ];

  for (const pattern of relativePatterns) {
    const match = normalized.match(pattern.re);
    if (match) {
      const label =
        lang === "sl"
          ? pattern.labelSl.replace("$1", match[1] ?? "")
          : pattern.labelEn.replace("$1", match[1] ?? "");
      return { precision: "vague", label };
    }
  }

  const monthOnly = normalized.match(new RegExp(`\\b(${MONTH_PATTERN})\\b`, "i"));
  if (monthOnly && !normalized.match(new RegExp(`\\d{1,2}\\.?\\s*${monthOnly[1]}`, "i"))) {
    const monthLabel = monthOnly[1]!.replace(/\./g, "");
    const year = inferYear(resolveMonthIndex(monthOnly[1]!) ?? 0);
    return {
      precision: "vague",
      label: lang === "sl" ? `${monthLabel} ${year}` : `${monthLabel} ${year}`,
    };
  }

  return null;
}

/** Detect exact vs vague travel dates mentioned in natural language. */
export function extractHeroChatDates(text: string, lang = "sl"): HeroChatDateParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { precision: "none", label: "" };

  return (
    extractIsoRange(trimmed) ??
    extractDayRange(trimmed, lang) ??
    extractSingleDay(trimmed, lang) ??
    extractVague(trimmed, lang) ?? { precision: "none", label: "" }
  );
}
