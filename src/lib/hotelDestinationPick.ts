/** Booking.com RapidAPI destination row (subset we care about). */
export type BookingDestRow = {
  dest_id?: string | number;
  search_type?: string;
  label?: string;
  name?: string;
  city_name?: string;
};

type StayCountry = {
  english: string;
  capital: string;
  pattern: RegExp;
  /** Stems so "v Sloveniji" / "na Tajskem" still resolve to the country. */
  needles: string[];
};

/**
 * Country chips / typed country names. Search the country, not the capital.
 * Capital is only a fallback when the country dest returns zero stays.
 */
const STAY_COUNTRIES: StayCountry[] = [
  { english: "Thailand", capital: "Bangkok", pattern: /^(thailand|tajska)$/i, needles: ["thailand", "tajsk"] },
  { english: "Spain", capital: "Barcelona", pattern: /^(spain|španija|spanija|españa|spanien)$/i, needles: ["spain", "španij", "spanij", "españa", "spanien"] },
  { english: "Italy", capital: "Rome", pattern: /^(italy|italija|italia|italien)$/i, needles: ["italy", "italij", "italia", "italien"] },
  { english: "Croatia", capital: "Split", pattern: /^(croatia|hrvaška|hrvaska|hrvatska|kroatien)$/i, needles: ["croatia", "hrvašk", "hrvask", "hrvatsk", "kroatien"] },
  { english: "Greece", capital: "Athens", pattern: /^(greece|grčija|grcija|ellada|griechenland)$/i, needles: ["greece", "grčij", "grcij", "ellada", "griechenland"] },
  { english: "Slovenia", capital: "Ljubljana", pattern: /^(slovenia|slovenija|slowenien)$/i, needles: ["slovenia", "slovenij", "slowenien"] },
  { english: "France", capital: "Paris", pattern: /^(france|francija|frankreich)$/i, needles: ["france", "francij", "frankreich"] },
  { english: "Portugal", capital: "Lisbon", pattern: /^(portugal)$/i, needles: ["portugal"] },
];

export function matchStayCountry(query: string): StayCountry | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  return STAY_COUNTRIES.find((c) => c.pattern.test(trimmed)) ?? null;
}

/** Find a country mentioned anywhere in a stay query. */
export function findStayCountryInText(text: string): StayCountry | null {
  const lower = text.toLowerCase();
  if (!lower.trim()) return null;
  return STAY_COUNTRIES.find((c) => c.needles.some((n) => lower.includes(n))) ?? null;
}

export function isCountryStayQuery(query: string): boolean {
  return matchStayCountry(query) != null;
}

/** Capital / bookable city — only when a country-wide dest comes back empty. */
export function hotelCapitalFallback(query: string): string | undefined {
  return matchStayCountry(query)?.capital;
}

/**
 * Normalize the Booking lookup string.
 * City-specific aliases stay; countries stay countries (English name).
 */
export function hotelSearchQueryAlias(city: string): string {
  const trimmed = city.trim();
  if (/^krabi$/i.test(trimmed)) return "Ao Nang";
  if (/phi\s*phi/i.test(trimmed)) return "Ko Phi Phi Don";
  const country = matchStayCountry(trimmed);
  if (country) return country.english;
  return trimmed;
}

function rowLabel(row: BookingDestRow): string {
  return String(row.label ?? row.name ?? row.city_name ?? "").trim();
}

export function pickBestBookingDestination(
  query: string,
  rows: BookingDestRow[],
): BookingDestRow | null {
  if (!rows.length) return null;
  const q = query.trim().toLowerCase();
  if (!q) return rows[0] ?? null;

  const isKrabiSearch = /^krabi$|^ao nang$/i.test(query.trim());
  const preferCountry = isCountryStayQuery(query);

  let best: BookingDestRow | null = null;
  let bestScore = -Infinity;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.dest_id == null) continue;
    const label = rowLabel(row).toLowerCase();
    const type = String(row.search_type ?? "").toLowerCase();
    let score = 0;

    if (label === q) score += 100;
    else if (label.startsWith(q + ",") || label.startsWith(q + " ")) score += 85;
    else if (label.includes(q)) score += 45;

    if (preferCountry) {
      if (type === "country") score += 80;
      else if (type === "region" || type === "province") score += 15;
      else if (type === "city" || type === "district" || type === "hotel") score -= 20;
    } else if (type === "city" || type === "district" || type === "hotel") {
      score += 35;
    } else if (type === "region" || type === "province") {
      score -= 25;
    }

    if (isKrabiSearch) {
      if (/ao nang|krabi town|krabi city/.test(label)) score += 55;
      if (/lanta/.test(label)) score -= 70;
    }

    // Stable tie-break: earlier API order.
    score -= i * 0.01;

    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return best ?? rows[0] ?? null;
}
