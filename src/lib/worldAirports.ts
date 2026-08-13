import type { PlaceSuggestion } from "@/lib/places.functions";
import worldAirportsData from "@/lib/data/worldAirports.json";

type AirportRow = [string, string, string, string, number, string?];
type CountryRow = [string, string[]];

type WorldPayload = {
  airports: AirportRow[];
  countries: CountryRow[];
};

const payload = worldAirportsData as WorldPayload;

export type WorldAirport = {
  iata: string;
  city: string;
  name: string;
  country: string;
  size: number;
  keys: string;
};

const AIRPORTS: WorldAirport[] = payload.airports.map((row) => ({
  iata: row[0],
  city: row[1],
  name: row[2],
  country: row[3],
  size: row[4],
  keys: row[5] ?? "",
}));

const COUNTRY_NAMES: Array<{ code: string; names: string[] }> = payload.countries.map(
  (row) => ({ code: row[0], names: row[1] }),
);

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSuggestion(airport: WorldAirport): PlaceSuggestion {
  return {
    iata: airport.iata,
    name: airport.name,
    city: airport.city,
    country: airport.country,
    type: "airport",
  };
}

function countryCodesForQuery(q: string): string[] {
  if (q.length < 2) return [];
  const exact: string[] = [];
  const prefix: string[] = [];
  for (const country of COUNTRY_NAMES) {
    if (country.code.toLowerCase() === q) {
      exact.push(country.code);
      continue;
    }
    for (const name of country.names) {
      if (name === q) {
        exact.push(country.code);
        break;
      }
      if (q.length >= 4 && name.startsWith(q)) {
        prefix.push(country.code);
        break;
      }
    }
  }
  return [...new Set(exact.length ? exact : prefix)];
}

function scoreAirport(airport: WorldAirport, q: string): number {
  const iata = airport.iata.toLowerCase();
  if (iata === q) return 10_000;
  if (iata.startsWith(q)) return 9_000;
  const city = normalize(airport.city);
  const name = normalize(airport.name);
  if (city === q) return 8_500;
  if (city.startsWith(q)) return 8_000;
  if (q.length >= 3 && city.includes(q)) return 7_000;
  if (name === q) return 7_800;
  if (name.startsWith(q)) return 6_800;
  if (q.length >= 3 && name.includes(q)) return 6_200;
  if (q.length >= 3 && airport.keys.includes(q)) return 5_800;
  return 0;
}

export function worldAirportCount(): number {
  return AIRPORTS.length;
}

/** Worldwide IATA search: city, airport name, country, or code. */
export function searchWorldAirports(query: string, limit = 8): PlaceSuggestion[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  const scored: Array<{ airport: WorldAirport; score: number }> = [];
  for (const airport of AIRPORTS) {
    const score = scoreAirport(airport, q);
    if (score > 0) scored.push({ airport, score });
  }

  const countryCodes = countryCodesForQuery(q);
  if (countryCodes.length) {
    const seen = new Set(scored.map((s) => s.airport.iata));
    for (const airport of AIRPORTS) {
      if (!countryCodes.includes(airport.country) || seen.has(airport.iata)) continue;
      scored.push({ airport, score: 8_200 - airport.size * 80 });
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.airport.size - b.airport.size ||
      a.airport.city.localeCompare(b.airport.city),
  );

  const out: PlaceSuggestion[] = [];
  const used = new Set<string>();
  for (const row of scored) {
    if (used.has(row.airport.iata)) continue;
    used.add(row.airport.iata);
    out.push(toSuggestion(row.airport));
    if (out.length >= limit) break;
  }
  return out;
}
