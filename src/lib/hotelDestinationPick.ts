import { lookupDestination } from "@/lib/destinationCoords";
import { matchResortStayMix } from "@/lib/resortStayMix";

/** Booking.com RapidAPI destination row (subset we care about). */
export type BookingDestRow = {
  dest_id?: string | number;
  search_type?: string;
  label?: string;
  name?: string;
  city_name?: string;
  country?: string;
  cc1?: string;
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
  { english: "Maldives", capital: "Malé", pattern: /^(maldives|maldivi|malediven)$/i, needles: ["maldives", "maldiv", "malediven"] },
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

/** Booking `ss` / searchDestination — place only, never "City, localized country". */
export function bookingPlaceHead(query: string): string {
  return query
    .trim()
    .replace(/\s*\([A-Za-z]{3}\)\s*$/g, "")
    .split(",")[0]
    ?.replace(/\s+/g, " ")
    .trim() ?? "";
}

/**
 * Normalize the Booking lookup string.
 * City-specific aliases stay; countries stay countries (English name).
 */
export function hotelSearchQueryAlias(city: string): string {
  const trimmed = city.trim();
  if (!trimmed) return "";
  const head = bookingPlaceHead(trimmed);
  if (/^krabi$/i.test(head) || /^krabi$/i.test(trimmed)) return "Ao Nang";
  if (/phi\s*phi/i.test(head) || /phi\s*phi/i.test(trimmed)) return "Ko Phi Phi Don";
  const country = matchStayCountry(head) || matchStayCountry(trimmed);
  if (country) return country.english;
  const iataHead = /^[A-Za-z]{3}$/.test(head) ? head : /^[A-Za-z]{3}$/.test(trimmed) ? trimmed : "";
  if (iataHead) {
    const fromIata = lookupDestination(iataHead.toUpperCase());
    if (fromIata?.name) return fromIata.name;
  }
  return head || trimmed;
}

/** Resort / stay search: country names and IATA become Booking-English place names. */
export function hotelSearchQueryForStay(place: string, destIata?: string): string {
  const aliased = hotelSearchQueryAlias(place);
  if (aliased) return aliased;
  const iata = (destIata ?? "").trim().toUpperCase();
  return (iata && lookupDestination(iata)?.name) || bookingPlaceHead(place);
}

function rowCountryCode(row: BookingDestRow): string {
  const raw = String(row.cc1 ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  const country = String(row.country ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(country)) return country.toUpperCase();
  return "";
}

function rowLabel(row: BookingDestRow): string {
  return String(row.label ?? row.name ?? row.city_name ?? "").trim();
}

export function pickBestBookingDestination(
  query: string,
  rows: BookingDestRow[],
  opts?: { countryCode?: string; destIata?: string },
): BookingDestRow | null {
  if (!rows.length) return null;
  const q = query.trim().toLowerCase();
  if (!q) return rows[0] ?? null;

  const wantCc = (opts?.countryCode ?? "").trim().toUpperCase();
  const isKrabiSearch = /^krabi$|^ao nang$/i.test(query.trim());
  const preferCountry = isCountryStayQuery(query);
  const mix = matchResortStayMix({
    countryCode: opts?.countryCode,
    destIata: opts?.destIata,
  });

  const scoreRows = (allowMismatch: boolean): BookingDestRow | null => {
    let best: BookingDestRow | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (row.dest_id == null) continue;
      const rowCc = rowCountryCode(row);
      if (!allowMismatch && wantCc && rowCc && rowCc !== wantCc) continue;
      const label = rowLabel(row).toLowerCase();
      const type = String(row.search_type ?? "").toLowerCase();
      let score = 0;

      if (label === q) score += 100;
      else if (label.startsWith(`${q},`) || label.startsWith(`${q} `)) score += 85;
      else if (label.includes(q)) score += 45;

      if (wantCc && rowCc === wantCc) score += 50;

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

      if (mix) {
        if (mix.excludePlace.test(label) || mix.excludeCityExact.test(label)) score -= 80;
        if (mix.valueNeedles.some((needle) => label.includes(needle))) score += 40;
      }

      score -= i * 0.01;
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }
    return best;
  };

  const matched = scoreRows(false);
  if (matched) return matched;
  // When the flight IATA pins a country, never fall back to another country's dest
  // (e.g. a Slovenian "Maldivi" lookup that Booking maps to a BA city).
  if (wantCc && rows.some((row) => Boolean(rowCountryCode(row)))) return null;
  return scoreRows(true) ?? rows[0] ?? null;
}
