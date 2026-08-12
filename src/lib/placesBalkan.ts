type PlaceHit = {
  iata: string;
  name: string;
  city: string;
  country: string;
  type: "airport" | "city";
};

/** “Balkan” must not resolve to Balkan Province, Turkmenistan. */
export function rankWesternBalkansPlaces<T extends PlaceHit>(
  query: string,
  suggestions: T[],
): T[] {
  const q = query.trim().toLowerCase();
  if (!/\bbalkan/.test(q)) return suggestions;
  const filtered = suggestions.filter((s) => s.country !== "TM");
  const hasBalkan = filtered.some((s) => /balkan/i.test(`${s.name} ${s.city}`));
  if (hasBalkan) return filtered;
  return [
    {
      iata: "balkan",
      name: "Balkan",
      city: "Western Balkans",
      country: "",
      type: "city",
    } as T,
    ...filtered,
  ];
}
