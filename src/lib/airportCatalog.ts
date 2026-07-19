import type { PlaceSuggestion } from "@/lib/places.functions";

/** Curated hubs for chip-first origin UX + offline fuzzy match. */
export type AirportHub = {
  iata: string;
  city: string;
  name: string;
  country: string;
  /** Lowercase aliases incl. typos / local names. */
  aliases: string[];
  /** Shown in the quick-pick row. */
  featured?: boolean;
};

export const AIRPORT_HUBS: AirportHub[] = [
  {
    iata: "LJU",
    city: "Ljubljana",
    name: "Ljubljana Jože Pučnik",
    country: "SI",
    aliases: ["ljubljana", "ljubljani", "ljubljane", "lj", "lju", "lublana", "ljubliana", "brnik"],
    featured: true,
  },
  {
    iata: "ZAG",
    city: "Zagreb",
    name: "Zagreb Franjo Tuđman",
    country: "HR",
    aliases: ["zagreb", "zagreba", "zag", "zagrebu"],
    featured: true,
  },
  {
    iata: "VIE",
    city: "Vienna",
    name: "Vienna International",
    country: "AT",
    aliases: ["vienna", "wien", "dunaj", "dunaja", "dunaju", "vie", "dunai", "viena"],
    featured: true,
  },
  {
    iata: "MXP",
    city: "Milan",
    name: "Milan Malpensa",
    country: "IT",
    aliases: ["milan", "milano", "malpensa", "mxp", "milana"],
    featured: true,
  },
  {
    iata: "BUD",
    city: "Budapest",
    name: "Budapest Ferenc Liszt",
    country: "HU",
    aliases: [
      "budapest",
      "budimpešta",
      "budimpesta",
      "budimšeta",
      "budimseta",
      "bud",
      "budapešta",
    ],
    featured: true,
  },
  {
    iata: "MUC",
    city: "Munich",
    name: "Munich Airport",
    country: "DE",
    aliases: ["munich", "münchen", "munchen", "muenchen", "muc"],
    featured: true,
  },
  {
    iata: "FRA",
    city: "Frankfurt",
    name: "Frankfurt Airport",
    country: "DE",
    aliases: ["frankfurt", "fra", "frankfurta"],
    featured: true,
  },
  {
    iata: "ZRH",
    city: "Zurich",
    name: "Zurich Airport",
    country: "CH",
    aliases: ["zurich", "zürich", "zuerich", "zrh", "cirih"],
    featured: true,
  },
  {
    iata: "VCE",
    city: "Venice",
    name: "Venice Marco Polo",
    country: "IT",
    aliases: ["venice", "benetke", "venezia", "vce", "benetkah"],
    featured: true,
  },
  {
    iata: "TRS",
    city: "Trieste",
    name: "Trieste Airport",
    country: "IT",
    aliases: ["trieste", "trst", "trs", "triestu"],
    featured: true,
  },
  {
    iata: "GRZ",
    city: "Graz",
    name: "Graz Airport",
    country: "AT",
    aliases: ["graz", "grz", "gradec"],
  },
  {
    iata: "INN",
    city: "Innsbruck",
    name: "Innsbruck Airport",
    country: "AT",
    aliases: ["innsbruck", "inn"],
  },
  {
    iata: "LIN",
    city: "Milan",
    name: "Milan Linate",
    country: "IT",
    aliases: ["linate", "lin"],
  },
  {
    iata: "BGY",
    city: "Milan",
    name: "Milan Bergamo",
    country: "IT",
    aliases: ["bergamo", "bgy", "orio"],
  },
  {
    iata: "CDG",
    city: "Paris",
    name: "Paris Charles de Gaulle",
    country: "FR",
    aliases: ["paris", "pariz", "cdg", "charles de gaulle"],
  },
  {
    iata: "ORY",
    city: "Paris",
    name: "Paris Orly",
    country: "FR",
    aliases: ["orly", "ory"],
  },
  {
    iata: "LHR",
    city: "London",
    name: "London Heathrow",
    country: "GB",
    aliases: ["london", "londra", "heathrow", "lhr"],
  },
  {
    iata: "LGW",
    city: "London",
    name: "London Gatwick",
    country: "GB",
    aliases: ["gatwick", "lgw"],
  },
  {
    iata: "FCO",
    city: "Rome",
    name: "Rome Fiumicino",
    country: "IT",
    aliases: ["rome", "roma", "fiumicino", "fco", "rim"],
  },
  {
    iata: "AMS",
    city: "Amsterdam",
    name: "Amsterdam Schiphol",
    country: "NL",
    aliases: ["amsterdam", "schiphol", "ams"],
  },
  {
    iata: "PRG",
    city: "Prague",
    name: "Prague Václav Havel",
    country: "CZ",
    aliases: ["prague", "praha", "praga", "prg"],
  },
  {
    iata: "BEG",
    city: "Belgrade",
    name: "Belgrade Nikola Tesla",
    country: "RS",
    aliases: ["belgrade", "beograd", "beg"],
  },
];

const HUB_BY_IATA = new Map(AIRPORT_HUBS.map((h) => [h.iata, h]));

export function getAirportHub(iata: string): AirportHub | undefined {
  return HUB_BY_IATA.get(iata.trim().toUpperCase());
}

export function featuredAirportHubs(): AirportHub[] {
  return AIRPORT_HUBS.filter((h) => h.featured);
}

export function hubToSuggestion(hub: AirportHub): PlaceSuggestion {
  return {
    iata: hub.iata,
    name: hub.name,
    city: hub.city,
    country: hub.country,
    type: "airport",
  };
}

export function formatAirportLabel(hub: Pick<AirportHub, "iata" | "city">): string {
  return `${hub.city} (${hub.iata})`;
}

export function formatOriginSelection(iatas: string[]): string {
  return iatas
    .map((code) => {
      const hub = getAirportHub(code);
      return hub ? formatAirportLabel(hub) : code;
    })
    .join(" · ");
}

/** Strip diacritics for fuzzy compare (ljubljana ≈ ljűbljana). */
export function normalizeAirportQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i;
    for (let j = 0; j < b.length; j++) {
      const cur = row[j + 1]!;
      const cost = a[i] === b[j] ? 0 : 1;
      row[j + 1] = Math.min(row[j + 1]! + 1, row[j]! + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length]!;
}

type ScoredHub = { hub: AirportHub; score: number };

function scoreHub(hub: AirportHub, q: string): number {
  if (!q) return 0;
  const iata = hub.iata.toLowerCase();
  if (iata === q) return 10_000;
  if (iata.startsWith(q)) return 9_000;

  let best = 0;
  const tokens = [hub.city, hub.name, ...hub.aliases].map(normalizeAirportQuery);
  for (const token of tokens) {
    if (!token) continue;
    if (token === q) best = Math.max(best, 8_500);
    else if (token.startsWith(q)) best = Math.max(best, 7_500 - q.length);
    else if (q.startsWith(token) && token.length >= 3) best = Math.max(best, 6_500);
    else if (token.includes(q) && q.length >= 3) best = Math.max(best, 5_500);
    else if (q.length >= 3 && token.length >= 3) {
      const dist = levenshtein(q, token.slice(0, Math.max(q.length, token.length)));
      const maxLen = Math.max(q.length, token.length);
      const allowed = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
      if (dist <= allowed) {
        best = Math.max(best, 4_000 - dist * 200 - Math.abs(maxLen - q.length) * 10);
      }
    }
  }
  return best;
}

/** Offline fuzzy airport search — works even when Duffel is slow/empty. */
export function searchAirportCatalog(query: string, limit = 8): PlaceSuggestion[] {
  const q = normalizeAirportQuery(query);
  if (q.length < 1) return [];

  const scored: ScoredHub[] = [];
  for (const hub of AIRPORT_HUBS) {
    const score = scoreHub(hub, q);
    if (score > 0) scored.push({ hub, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.hub.city.localeCompare(b.hub.city))
    .slice(0, limit)
    .map((s) => hubToSuggestion(s.hub));
}

/** Best single correction when the user mistyped a city. */
export function didYouMeanAirport(query: string): PlaceSuggestion | null {
  const q = normalizeAirportQuery(query);
  if (q.length < 2) return null;

  let best: ScoredHub | null = null;
  for (const hub of AIRPORT_HUBS) {
    const score = scoreHub(hub, q);
    if (score < 3_500) continue;
    if (!best || score > best.score) best = { hub, score };
  }
  // Exact / strong prefix matches don't need a "did you mean".
  if (!best || best.score >= 7_500) return null;
  return hubToSuggestion(best.hub);
}

/** Patterns for Make/NL origin parsing — keep in sync with catalog aliases. */
export function originAliasPatterns(): Array<{ pattern: RegExp; iata: string }> {
  return AIRPORT_HUBS.map((hub) => {
    const alts = [
      ...new Set([
        hub.iata.toLowerCase(),
        ...hub.aliases.map((a) => a.toLowerCase()),
        ...hub.aliases.map(normalizeAirportQuery),
      ]),
    ]
      .filter(Boolean)
      .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .sort((a, b) => b.length - a.length);
    return {
      iata: hub.iata,
      pattern: new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${alts.join("|")})(?=[^\\p{L}\\p{N}]|$)`, "iu"),
    };
  });
}
