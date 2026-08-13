import { normalizeAirportQuery, searchAirportCatalog } from "@/lib/airportCatalog";
import type { PlaceSuggestion } from "@/lib/places.functions";

/** Well-known hubs to surface when Duffel returns obscure homonyms (Sydney ≠ Sidney MT). */
const PREFERRED_BY_QUERY: Record<string, PlaceSuggestion[]> = {
  sydney: [
    {
      iata: "SYD",
      name: "Sydney Airport",
      city: "Sydney",
      country: "AU",
      type: "airport",
    },
  ],
  sidney: [
    {
      iata: "SYD",
      name: "Sydney Airport",
      city: "Sydney",
      country: "AU",
      type: "airport",
    },
  ],
  syd: [
    {
      iata: "SYD",
      name: "Sydney Airport",
      city: "Sydney",
      country: "AU",
      type: "airport",
    },
  ],
  paris: [
    { iata: "CDG", name: "Paris Charles de Gaulle", city: "Paris", country: "FR", type: "airport" },
    { iata: "ORY", name: "Paris Orly", city: "Paris", country: "FR", type: "airport" },
  ],
  london: [
    { iata: "LHR", name: "London Heathrow", city: "London", country: "GB", type: "airport" },
    { iata: "LGW", name: "London Gatwick", city: "London", country: "GB", type: "airport" },
  ],
  rome: [
    { iata: "FCO", name: "Rome Fiumicino", city: "Rome", country: "IT", type: "airport" },
  ],
  roma: [
    { iata: "FCO", name: "Rome Fiumicino", city: "Rome", country: "IT", type: "airport" },
  ],
  astana: [
    {
      iata: "NQZ",
      name: "Nursultan Nazarbayev International",
      city: "Astana",
      country: "KZ",
      type: "airport",
    },
  ],
  "nur-sultan": [
    {
      iata: "NQZ",
      name: "Nursultan Nazarbayev International",
      city: "Astana",
      country: "KZ",
      type: "airport",
    },
  ],
  kazahstan: [
    {
      iata: "NQZ",
      name: "Nursultan Nazarbayev International",
      city: "Astana",
      country: "KZ",
      type: "airport",
    },
    {
      iata: "ALA",
      name: "Almaty International",
      city: "Almaty",
      country: "KZ",
      type: "airport",
    },
  ],
  kazakhstan: [
    {
      iata: "NQZ",
      name: "Nursultan Nazarbayev International",
      city: "Astana",
      country: "KZ",
      type: "airport",
    },
    {
      iata: "ALA",
      name: "Almaty International",
      city: "Almaty",
      country: "KZ",
      type: "airport",
    },
  ],
  almaty: [
    {
      iata: "ALA",
      name: "Almaty International",
      city: "Almaty",
      country: "KZ",
      type: "airport",
    },
  ],
};

/** Regional traps — demote when query clearly targets a major city. */
const HOMONYM_DEMOTE: Array<{ query: RegExp; iata: string }> = [
  { query: /sydn?ey/i, iata: "SDY" },
  { query: /sydn?ey/i, iata: "SWZ" },
];

function scoreSuggestion(s: PlaceSuggestion, query: string): number {
  const q = query.trim().toLowerCase();
  let score = 0;

  const preferred = PREFERRED_BY_QUERY[q] ?? [];
  const prefIdx = preferred.findIndex((p) => p.iata === s.iata);
  if (prefIdx >= 0) score += 1000 - prefIdx;

  if (/^sydn?ey/.test(q) && s.iata === "SYD") score += 800;
  if (/^syd/.test(q) && s.iata === "SYD") score += 600;

  for (const demote of HOMONYM_DEMOTE) {
    if (demote.query.test(q) && s.iata === demote.iata) score -= 500;
  }

  if (s.iata.length === 3 && /^[A-Z]{3}$/.test(s.iata)) score += 20;
  if (s.country && s.country.length === 2) score += 5;

  return score;
}

function injectedForQuery(query: string): PlaceSuggestion[] {
  const q = query.trim().toLowerCase();
  if (PREFERRED_BY_QUERY[q]) return PREFERRED_BY_QUERY[q];
  if (/^sydn?ey/.test(q)) return PREFERRED_BY_QUERY.sydney;
  if (/^syd\b/.test(q) || q === "syd") return PREFERRED_BY_QUERY.syd;
  if (/^paris/.test(q)) return PREFERRED_BY_QUERY.paris;
  if (/^london/.test(q)) return PREFERRED_BY_QUERY.london;
  if (/^rom[ae]/.test(q)) return PREFERRED_BY_QUERY.rome;
  if (/^astan/.test(q) || /^nur[-\s]?sultan/.test(q)) return PREFERRED_BY_QUERY.astana;
  if (/^kazahstan|^kazakhstan|^kasachstan/.test(q)) return PREFERRED_BY_QUERY.kazahstan;
  if (/^almaty|^alma\s*ata/.test(q)) return PREFERRED_BY_QUERY.almaty;
  return [];
}

/** Drop Duffel/catalog noise that does not mention the typed city or IATA. */
export function airportTextMatchesQuery(
  suggestion: PlaceSuggestion,
  query: string,
): boolean {
  const q = normalizeAirportQuery(query);
  if (q.length < 2) return false;
  const iata = suggestion.iata.toLowerCase();
  if (iata === q || iata.startsWith(q)) return true;
  const city = normalizeAirportQuery(suggestion.city);
  const name = normalizeAirportQuery(suggestion.name);
  if (city === q || city.startsWith(q) || (q.length >= 3 && city.includes(q))) return true;
  if (q.length >= 3 && name.includes(q)) return true;
  return false;
}

export function rankAirportSuggestions(
  query: string,
  suggestions: PlaceSuggestion[],
): PlaceSuggestion[] {
  const injected = injectedForQuery(query);
  const catalog = searchAirportCatalog(query, 8);

  const merged: PlaceSuggestion[] = [];
  const seen = new Set<string>();

  const trusted = new Set(injected.map((p) => p.iata.toUpperCase()));

  for (const p of [...injected, ...catalog, ...suggestions]) {
    const key = p.iata.toUpperCase();
    if (!/^[A-Z]{3}$/.test(key) || seen.has(key)) continue;
    if (!trusted.has(key) && !airportTextMatchesQuery(p, query)) continue;
    seen.add(key);
    merged.push({ ...p, iata: key });
  }

  return merged
    .sort((a, b) => scoreSuggestion(b, query) - scoreSuggestion(a, query))
    .slice(0, 12);
}

/** Hint when user likely picked wrong homonym airport. */
export function airportConfusionHint(
  origin: string,
  destination: string,
): string | null {
  const to = destination.toUpperCase();
  if (to === "SDY") {
    return "error.sydneyNotSidney";
  }
  if (to === "STN" && origin === "VIE") {
    return null;
  }
  return null;
}
