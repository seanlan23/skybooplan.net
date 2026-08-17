import type { PlaceSuggestion } from "@/lib/places.functions";
import { mergeStaySuggestions } from "@/lib/stayPlaces";

type NamedPlace = {
  name: string;
  city: string;
  country: string;
  aliases: string[];
};

/** Cities and countries for car / motorhome / full-plan typing — never airports. */
const NAMED_PLACES: NamedPlace[] = [
  { name: "Albanija", city: "Albanija", country: "AL", aliases: ["albania", "albanija", "albanien", "albanie"] },
  { name: "Tirana", city: "Tirana", country: "AL", aliases: ["tirana"] },
  { name: "Split", city: "Split", country: "HR", aliases: ["split", "spalato"] },
  { name: "Dubrovnik", city: "Dubrovnik", country: "HR", aliases: ["dubrovnik"] },
  { name: "Zagreb", city: "Zagreb", country: "HR", aliases: ["zagreb"] },
  { name: "Hrvaška", city: "Hrvaška", country: "HR", aliases: ["croatia", "hrvaška", "hrvatska", "kroatien"] },
  { name: "Črna gora", city: "Črna gora", country: "ME", aliases: ["montenegro", "crna gora", "črna gora"] },
  { name: "Bosna in Hercegovina", city: "Bosna in Hercegovina", country: "BA", aliases: ["bosnia", "bosna"] },
  { name: "Italija", city: "Italija", country: "IT", aliases: ["italy", "italija", "italia"] },
  { name: "Španija", city: "Španija", country: "ES", aliases: ["spain", "španija", "spanija", "espana"] },
  { name: "Portugalska", city: "Portugalska", country: "PT", aliases: ["portugal", "portugalska"] },
  { name: "Japonska", city: "Japonska", country: "JP", aliases: ["japan", "japonska"] },
  { name: "Islandija", city: "Islandija", country: "IS", aliases: ["iceland", "islandija", "island"] },
  { name: "Grčija", city: "Grčija", country: "GR", aliases: ["greece", "grčija", "grcija"] },
  { name: "Dunaj", city: "Dunaj", country: "AT", aliases: ["vienna", "dunaj", "wien"] },
  { name: "Ljubljana", city: "Ljubljana", country: "SI", aliases: ["ljubljana"] },
];

function normalizePlaceQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function searchNamedPlaces(query: string, limit = 8): PlaceSuggestion[] {
  const q = normalizePlaceQuery(query);
  if (q.length < 2) return [];

  return NAMED_PLACES.filter((place) => {
    const name = normalizePlaceQuery(place.name);
    return (
      name.includes(q) ||
      q.includes(name) ||
      place.aliases.some((alias) => alias.includes(q) || q.startsWith(alias) || alias.startsWith(q))
    );
  })
    .slice(0, limit)
    .map((place) => ({
      iata: `place.${place.name}`,
      name: place.name,
      city: place.city,
      country: place.country,
      type: "city" as const,
    }));
}

export function mergePlaceSuggestions(
  query: string,
  remote: PlaceSuggestion[],
): PlaceSuggestion[] {
  const local = searchNamedPlaces(query, 8);
  const withStays = mergeStaySuggestions(query, remote);
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const suggestion of [...local, ...withStays]) {
    const key = suggestion.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    if (/^[A-Z]{3}$/.test(suggestion.iata)) continue;
    seen.add(key);
    out.push({ ...suggestion, type: "city" });
    if (out.length >= 10) break;
  }
  return out;
}

/** Drop "Tirana (TIA)" / "TIA Tirana" so a car trip keeps the city or country. */
export function roadPlaceFromDestination(dest: string): string {
  const t = dest.trim();
  if (!t) return t;
  const paren = t.match(/^(.*?)\s*\(([A-Z]{3})\)$/);
  if (paren?.[1]) return paren[1].trim();
  const iataFirst = t.match(/^([A-Z]{3})\s+(.+)$/);
  if (iataFirst?.[2]) return iataFirst[2].replace(/\s*[·•].*$/, "").trim();
  return t;
}
