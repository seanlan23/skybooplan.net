import type { PlaceSuggestion } from "@/lib/places.functions";
import {
  hubToSuggestion,
  normalizeAirportQuery,
  searchAirportCatalog,
  type AirportHub,
} from "@/lib/airportCatalog";

/** Instant local hits for “Želim drugam” before Duffel returns. */
const POPULAR_DESTINATION_AIRPORTS: AirportHub[] = [
  {
    iata: "BCN",
    city: "Barcelona",
    name: "Barcelona El Prat",
    country: "ES",
    aliases: ["barcelona", "barca", "bcn", "el prat"],
  },
  {
    iata: "MNL",
    city: "Manila",
    name: "Ninoy Aquino International",
    country: "PH",
    aliases: ["manila", "mnl", "philippines", "filipini"],
  },
  {
    iata: "BKK",
    city: "Bangkok",
    name: "Suvarnabhumi",
    country: "TH",
    aliases: ["bangkok", "bkk", "thailand", "tajska"],
  },
  {
    iata: "HKT",
    city: "Phuket",
    name: "Phuket International",
    country: "TH",
    aliases: ["phuket", "hkt", "phuket island"],
  },
  {
    iata: "DPS",
    city: "Denpasar",
    name: "Ngurah Rai",
    country: "ID",
    aliases: ["bali", "denpasar", "dps", "ubud"],
  },
  {
    iata: "NRT",
    city: "Tokyo",
    name: "Narita",
    country: "JP",
    aliases: ["tokyo", "tokio", "narita", "nrt", "japan", "japonska"],
  },
  {
    iata: "HND",
    city: "Tokyo",
    name: "Haneda",
    country: "JP",
    aliases: ["haneda", "hnd", "tokyo haneda"],
  },
  {
    iata: "JFK",
    city: "New York",
    name: "John F. Kennedy",
    country: "US",
    aliases: ["new york", "nyc", "jfk", "newyork"],
  },
  {
    iata: "CDG",
    city: "Paris",
    name: "Charles de Gaulle",
    country: "FR",
    aliases: ["paris", "pariz", "cdg", "charles de gaulle"],
  },
  {
    iata: "FCO",
    city: "Rome",
    name: "Fiumicino",
    country: "IT",
    aliases: ["rome", "rim", "fco", "fiumicino"],
  },
  {
    iata: "LIS",
    city: "Lisbon",
    name: "Humberto Delgado",
    country: "PT",
    aliases: ["lisbon", "lisboa", "lizbona", "portugal", "portugalska", "lis"],
  },
  {
    iata: "MLE",
    city: "Malé",
    name: "Velana International",
    country: "MV",
    aliases: ["maldives", "maldivi", "male", "malé", "mle"],
  },
  {
    iata: "DXB",
    city: "Dubai",
    name: "Dubai International",
    country: "AE",
    aliases: ["dubai", "dxb"],
  },
  {
    iata: "SIN",
    city: "Singapore",
    name: "Changi",
    country: "SG",
    aliases: ["singapore", "singapur", "sin", "changi"],
  },
  {
    iata: "KUL",
    city: "Kuala Lumpur",
    name: "Kuala Lumpur International",
    country: "MY",
    aliases: ["kuala lumpur", "kl", "kul", "malaysia"],
  },
  {
    iata: "SYD",
    city: "Sydney",
    name: "Kingsford Smith",
    country: "AU",
    aliases: ["sydney", "syd", "australia"],
  },
  {
    iata: "LAX",
    city: "Los Angeles",
    name: "Los Angeles International",
    country: "US",
    aliases: ["los angeles", "la", "lax"],
  },
  {
    iata: "MAD",
    city: "Madrid",
    name: "Adolfo Suárez Madrid-Barajas",
    country: "ES",
    aliases: ["madrid", "mad"],
  },
  {
    iata: "ATH",
    city: "Athens",
    name: "Eleftherios Venizelos",
    country: "GR",
    aliases: ["athens", "atene", "ath", "greece", "grčija", "grcija"],
  },
  {
    iata: "IST",
    city: "Istanbul",
    name: "Istanbul Airport",
    country: "TR",
    aliases: ["istanbul", "ist", "turkey", "turčija", "turcija"],
  },
];

function scoreDest(hub: AirportHub, q: string): number {
  if (!q) return 0;
  const iata = hub.iata.toLowerCase();
  if (iata === q) return 10_000;
  if (iata.startsWith(q)) return 9_000;
  const city = normalizeAirportQuery(hub.city);
  const name = normalizeAirportQuery(hub.name);
  if (city === q) return 8_500;
  if (city.startsWith(q)) return 8_000;
  if (city.includes(q)) return 7_000;
  if (name.includes(q)) return 5_000;
  for (const alias of hub.aliases) {
    const a = normalizeAirportQuery(alias);
    if (a === q) return 8_200;
    if (a.startsWith(q)) return 7_500;
    if (a.includes(q)) return 6_000;
  }
  return 0;
}

/** Local destination airport suggestions (popular + origin hubs). */
export function searchDestinationAirports(
  query: string,
  limit = 8,
): PlaceSuggestion[] {
  const q = normalizeAirportQuery(query);
  if (q.length < 2) return [];

  const fromPopular = POPULAR_DESTINATION_AIRPORTS.map((hub) => ({
    hub,
    score: scoreDest(hub, q),
  }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => hubToSuggestion(x.hub));

  // Catalog hubs only when city/IATA actually contains the query — avoid
  // fuzzy noise like "phuke" → Belgrade/Venice.
  const fromCatalog = searchAirportCatalog(query, limit).filter((s) => {
    const iata = s.iata.toLowerCase();
    const city = normalizeAirportQuery(s.city);
    const name = normalizeAirportQuery(s.name);
    return iata.startsWith(q) || city.includes(q) || name.includes(q);
  });
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const s of [...fromPopular, ...fromCatalog]) {
    const key = s.iata.toUpperCase();
    if (!/^[A-Z]{3}$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, iata: key });
    if (out.length >= limit) break;
  }
  return out;
}

export function formatDestinationAirportPick(s: PlaceSuggestion): {
  value: string;
  label: string;
} {
  const city = s.city || s.name.replace(/ Airport$/i, "");
  return {
    value: `${city} (${s.iata})`,
    label: `${city} (${s.iata})`,
  };
}
