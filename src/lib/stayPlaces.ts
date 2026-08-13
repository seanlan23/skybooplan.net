import type { PlaceSuggestion } from "@/lib/places.functions";

type StayPlace = {
  name: string;
  city: string;
  country: string;
  aliases: string[];
};

/** Islands and stay spots that airport search must never “help” with. */
const STAY_PLACES: StayPlace[] = [
  {
    name: "Ko Phi Phi Don",
    city: "Krabi",
    country: "TH",
    aliases: ["phi phi", "phi phi don", "koh phi phi", "ko phi phi", "phiphi"],
  },
  {
    name: "Ao Nang",
    city: "Krabi",
    country: "TH",
    aliases: ["ao nang", "krabi"],
  },
  {
    name: "Phuket",
    city: "Phuket",
    country: "TH",
    aliases: ["phuket"],
  },
  {
    name: "Bangkok",
    city: "Bangkok",
    country: "TH",
    aliases: ["bangkok", "thailand", "tajska"],
  },
  {
    name: "Bali",
    city: "Bali",
    country: "ID",
    aliases: ["bali"],
  },
];

function normalizeStayQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

export function searchStayPlaces(query: string, limit = 8): PlaceSuggestion[] {
  const q = normalizeStayQuery(query);
  if (q.length < 2) return [];

  return STAY_PLACES.filter((place) => {
    const name = normalizeStayQuery(place.name);
    return (
      name.includes(q) ||
      place.aliases.some((alias) => alias.includes(q) || q.startsWith(alias) || alias.startsWith(q))
    );
  })
    .slice(0, limit)
    .map((place) => ({
      iata: `stay.${place.name}`,
      name: place.name,
      city: place.city,
      country: place.country,
      type: "city" as const,
    }));
}

export function mergeStaySuggestions(
  query: string,
  remote: PlaceSuggestion[],
): PlaceSuggestion[] {
  const local = searchStayPlaces(query, 8);
  const seen = new Set<string>();
  const out: PlaceSuggestion[] = [];
  for (const suggestion of [...local, ...remote]) {
    const key = suggestion.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(suggestion);
    if (out.length >= 10) break;
  }
  return out;
}

export function formatStayPlacePick(suggestion: PlaceSuggestion): {
  value: string;
  label: string;
} {
  const value = suggestion.name.trim();
  return { value, label: value };
}
