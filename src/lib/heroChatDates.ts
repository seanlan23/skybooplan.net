export type HeroChatDatePrecision = "exact" | "vague" | "none";

export type HeroChatDateParseResult = {
  precision: HeroChatDatePrecision;
  label: string;
  departDate?: string;
  returnDate?: string;
};

const MONTH_PATTERN =
  "januarja|februarja|marca|aprila|maja|junija|julija|avgusta|septembra|oktobra|novembra|decembra|januar|februar|marec|märz|maerz|april|maj|junij|juni|julij|juli|avgust|september|oktober|november|december|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|avg|aug|sep|okt|oct|nov|dec";

const SL_MONTHS: Record<string, number> = {
  jan: 0,
  januar: 0,
  januarja: 0,
  feb: 1,
  februar: 1,
  februarja: 1,
  mar: 2,
  marec: 2,
  marca: 2,
  märz: 2,
  maerz: 2,
  apr: 3,
  april: 3,
  aprila: 3,
  maj: 4,
  maja: 4,
  may: 4,
  mai: 4,
  jun: 5,
  junij: 5,
  junija: 5,
  juni: 5,
  jul: 6,
  julij: 6,
  julija: 6,
  juli: 6,
  avg: 7,
  avgust: 7,
  avgusta: 7,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  septembra: 8,
  okt: 9,
  oktober: 9,
  oktobra: 9,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  novembra: 10,
  dec: 11,
  december: 11,
  decembra: 11,
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

const EN_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const SL_MONTH_NAMES = [
  "januar",
  "februar",
  "marec",
  "april",
  "maj",
  "junij",
  "julij",
  "avgust",
  "september",
  "oktober",
  "november",
  "december",
] as const;

const DE_MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

function monthNameForLang(monthIndex: number, lang: string): string {
  const idx = Math.min(11, Math.max(0, monthIndex));
  const code = lang.toLowerCase().slice(0, 2);
  if (code === "sl") return SL_MONTH_NAMES[idx]!;
  if (code === "de") return DE_MONTH_NAMES[idx]!;
  return EN_MONTH_NAMES[idx]!;
}

function localeForLang(lang: string): string {
  const code = lang.toLowerCase().slice(0, 2);
  if (code === "sl") return "sl-SI";
  if (code === "de") return "de-DE";
  if (code === "fr") return "fr-FR";
  if (code === "es") return "es-ES";
  if (code === "it") return "it-IT";
  return "en-GB";
}

function formatDayMonth(day: number, monthIndex: number, lang: string): string {
  const d = new Date(2026, monthIndex, day, 12);
  return d.toLocaleDateString(localeForLang(lang), { day: "numeric", month: "long" });
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

/** Trip length like "14 dni" / "14 days" (2–60). */
export function extractTripLengthDays(text: string): number | null {
  const match = text.match(/\b(\d{1,2})\s*(?:dni|days?|nočitev|nights?)\b/i);
  if (!match) return null;
  const days = Number.parseInt(match[1]!, 10);
  if (!Number.isFinite(days) || days < 2 || days > 60) return null;
  return days;
}

function applyTripLength(
  result: HeroChatDateParseResult,
  tripDays: number | null,
  lang = "en",
): HeroChatDateParseResult {
  if (!tripDays || !result.departDate) return result;
  const [y, m, d] = result.departDate.split("-").map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d) return result;
  const returnDate = addDaysSafe(y, m - 1, d, tripDays);
  const code = lang.toLowerCase().slice(0, 2);
  const unit = code === "sl" ? "dni" : code === "de" ? "Tage" : "days";
  const label =
    result.label && !/\d+\s*(?:dni|days|Tage)\b/i.test(result.label)
      ? `${result.label} · ${tripDays} ${unit}`
      : result.label;
  return { ...result, returnDate, label: label || result.label };
}

/** "konec oktobra začetek novembra" → concrete depart/return for search without re-asking. */
function extractEndStartMonthRange(text: string, lang: string): HeroChatDateParseResult | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  // Include common typos: "onec" / "konc" for "konec".
  const range = normalized.match(
    new RegExp(
      `(?:konec|onec|konc|end\\s+of)\\s+(${MONTH_PATTERN})\\s+(?:(?:-|–|—|/|in)\\s*)?(?:začetek|zacetek|zaetek|start\\s+of)\\s+(${MONTH_PATTERN})`,
      "i",
    ),
  );
  if (!range) return null;

  const monthFrom = resolveMonthIndex(range[1]!);
  const monthTo = resolveMonthIndex(range[2]!);
  if (monthFrom == null || monthTo == null) return null;

  const yearFrom = inferYear(monthFrom);
  const yearTo = monthTo < monthFrom ? yearFrom + 1 : yearFrom;
  const departDate = toIsoDate(yearFrom, monthFrom, 26);
  const returnDate = toIsoDate(yearTo, monthTo, 5);
  const code = lang.toLowerCase().slice(0, 2);
  const label =
    code === "sl"
      ? `konec ${monthNameForLang(monthFrom, "sl")} → začetek ${monthNameForLang(monthTo, "sl")} ${yearFrom}`
      : code === "de"
        ? `Ende ${monthNameForLang(monthFrom, "de")} → Anfang ${monthNameForLang(monthTo, "de")} ${yearFrom}`
        : `late ${monthNameForLang(monthFrom, "en")} → early ${monthNameForLang(monthTo, "en")} ${yearFrom}`;

  return { precision: "exact", label, departDate, returnDate };
}

function extractMonthDashRange(text: string, lang: string): HeroChatDateParseResult | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const range = normalized.match(
    new RegExp(`\\b(${MONTH_PATTERN})\\s*(?:-|–|—|/)\\s*(${MONTH_PATTERN})\\b`, "i"),
  );
  if (!range) return null;

  const monthFrom = resolveMonthIndex(range[1]!);
  const monthTo = resolveMonthIndex(range[2]!);
  if (monthFrom == null || monthTo == null || monthFrom === monthTo) return null;

  const yearFrom = inferYear(monthFrom);
  const yearTo = monthTo < monthFrom ? yearFrom + 1 : yearFrom;
  const departDate = toIsoDate(yearFrom, monthFrom, 15);
  const returnDate = toIsoDate(yearTo, monthTo, 15);
  const code = lang.toLowerCase().slice(0, 2);
  const label =
    code === "sl"
      ? `${monthNameForLang(monthFrom, "sl")} – ${monthNameForLang(monthTo, "sl")} ${yearFrom}`
      : code === "de"
        ? `${monthNameForLang(monthFrom, "de")} – ${monthNameForLang(monthTo, "de")} ${yearFrom}`
        : `${monthNameForLang(monthFrom, "en")} – ${monthNameForLang(monthTo, "en")} ${yearFrom}`;

  return { precision: "exact", label, departDate, returnDate };
}

function extractVague(text: string, lang: string): HeroChatDateParseResult | null {
  const normalized = text.toLowerCase();
  const code = lang.toLowerCase().slice(0, 2);

  const relativePatterns: {
    re: RegExp;
    labelSl: string;
    labelEn: string;
    labelDe: string;
  }[] = [
    {
      re: /čez\s+(\d+)\s+tedn/i,
      labelSl: "čez $1 tedna",
      labelEn: "in $1 weeks",
      labelDe: "in $1 Wochen",
    },
    {
      re: /in\s+(\d+)\s+weeks?/i,
      labelSl: "čez $1 tedna",
      labelEn: "in $1 weeks",
      labelDe: "in $1 Wochen",
    },
    {
      re: /naslednji\s+teden|next\s+week|nächste\s+woche/i,
      labelSl: "naslednji teden",
      labelEn: "next week",
      labelDe: "nächste Woche",
    },
    {
      re: /konec\s+poletja|end\s+of\s+summer|ende\s+des\s+sommers/i,
      labelSl: "konec poletja",
      labelEn: "end of summer",
      labelDe: "Ende des Sommers",
    },
    {
      re: /poletj[ae]|summer|sommer/i,
      labelSl: "poletje",
      labelEn: "summer",
      labelDe: "Sommer",
    },
    {
      re: /pozimi|zim[ae]|winter/i,
      labelSl: "zima",
      labelEn: "winter",
      labelDe: "Winter",
    },
    {
      re: /spomladi|spring|frühling/i,
      labelSl: "spomlad",
      labelEn: "spring",
      labelDe: "Frühling",
    },
    {
      re: /jeseni|autumn|fall|herbst/i,
      labelSl: "jesen",
      labelEn: "autumn",
      labelDe: "Herbst",
    },
  ];

  for (const pattern of relativePatterns) {
    const match = normalized.match(pattern.re);
    if (match) {
      const template =
        code === "sl" ? pattern.labelSl : code === "de" ? pattern.labelDe : pattern.labelEn;
      const label = template.replace("$1", match[1] ?? "");
      return { precision: "vague", label };
    }
  }

  const endMonth = normalized.match(
    new RegExp(`(?:konec|onec|konc|end\\s+of|ende)\\s+(${MONTH_PATTERN})`, "i"),
  );
  if (endMonth) {
    const monthIndex = resolveMonthIndex(endMonth[1]!);
    if (monthIndex != null) {
      const year = inferYear(monthIndex);
      return {
        precision: "exact",
        label:
          code === "sl"
            ? `konec ${monthNameForLang(monthIndex, "sl")} ${year}`
            : code === "de"
              ? `Ende ${monthNameForLang(monthIndex, "de")} ${year}`
              : `late ${monthNameForLang(monthIndex, "en")} ${year}`,
        departDate: toIsoDate(year, monthIndex, 26),
        returnDate: addDaysSafe(year, monthIndex, 26, 14),
      };
    }
  }

  const startMonth = normalized.match(
    new RegExp(
      `(?:začetek|zacetek|zaetek|start\\s+of|anfang)\\s+(${MONTH_PATTERN})`,
      "i",
    ),
  );
  if (startMonth) {
    const monthIndex = resolveMonthIndex(startMonth[1]!);
    if (monthIndex != null) {
      const year = inferYear(monthIndex);
      const departDate = toIsoDate(year, monthIndex, 5);
      return {
        precision: "exact",
        label:
          code === "sl"
            ? `začetek ${monthNameForLang(monthIndex, "sl")} ${year}`
            : code === "de"
              ? `Anfang ${monthNameForLang(monthIndex, "de")} ${year}`
              : `early ${monthNameForLang(monthIndex, "en")} ${year}`,
        departDate,
        returnDate: addDaysSafe(year, monthIndex, 5, 14),
      };
    }
  }

  const monthOnly = normalized.match(new RegExp(`\\b(${MONTH_PATTERN})\\b`, "i"));
  if (monthOnly && !normalized.match(new RegExp(`\\d{1,2}\\.?\\s*${monthOnly[1]}`, "i"))) {
    const monthIndex = resolveMonthIndex(monthOnly[1]!) ?? 0;
    const year = inferYear(monthIndex);
    const departDate = toIsoDate(year, monthIndex, 15);
    return {
      precision: "vague",
      label: `${monthNameForLang(monthIndex, lang)} ${year}`,
      departDate,
      returnDate: addDaysSafe(year, monthIndex, 15, 14),
    };
  }

  return null;
}

function addDaysSafe(year: number, monthIndex: number, day: number, days: number): string {
  const d = new Date(year, monthIndex, day, 12);
  d.setDate(d.getDate() + days);
  return toIsoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Detect exact vs vague travel dates mentioned in natural language. */
export function extractHeroChatDates(text: string, lang = "en"): HeroChatDateParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { precision: "none", label: "" };

  const parsed =
    extractIsoRange(trimmed) ??
    extractDayRange(trimmed, lang) ??
    extractEndStartMonthRange(trimmed, lang) ??
    extractMonthDashRange(trimmed, lang) ??
    extractSingleDay(trimmed, lang) ??
    extractVague(trimmed, lang) ?? { precision: "none" as const, label: "" };

  return applyTripLength(parsed, extractTripLengthDays(trimmed), lang);
}
