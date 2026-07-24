/**
 * Curated overnight camp / RV park hubs for motorhome map pins.
 * Used when Gemini names a camp without coords — never IATA runways.
 */
export type CampgroundHub = {
  name: string;
  lat: number;
  lng: number;
  /** Extra match tokens (lowercase). */
  aliases?: string[];
};

/** City key (lowercase ASCII-ish) → nearby camps outside downtown. */
export const CAMPGROUNDS_BY_CITY: Record<string, CampgroundHub[]> = {
  vienna: [
    { name: "Camping Wien West", lat: 48.205, lng: 16.276, aliases: ["wien west", "vienna west"] },
    { name: "Camping Schlosspark Laxenburg", lat: 48.068, lng: 16.356, aliases: ["laxenburg"] },
  ],
  ljubljana: [
    { name: "Camping Ljubljana Resort", lat: 46.099, lng: 14.512, aliases: ["ljubljana resort"] },
  ],
  munich: [
    { name: "Camping München-Thalkirchen", lat: 48.095, lng: 11.546, aliases: ["thalkirchen", "munchen"] },
  ],
  zagreb: [
    { name: "Camping Zagreb", lat: 45.827, lng: 15.987, aliases: ["zagreb camp"] },
  ],
  split: [
    { name: "Camp Stobreč Split", lat: 43.502, lng: 16.528, aliases: ["stobrec", "stobreč"] },
    { name: "Camping Amarin", lat: 43.508, lng: 16.468, aliases: ["amarin"] },
  ],
  zadar: [
    { name: "Camping Zaton Holiday Resort", lat: 44.222, lng: 15.17, aliases: ["zaton"] },
    { name: "Camp Borik", lat: 44.14, lng: 15.216, aliases: ["borik"] },
  ],
  pula: [
    { name: "Camping Stoja", lat: 44.86, lng: 13.82, aliases: ["stoja"] },
  ],
  rovinj: [
    { name: "Camping Veštar", lat: 45.066, lng: 13.675, aliases: ["vestar", "veštar"] },
  ],
  amsterdam: [
    { name: "Camping Amsterdam Zeeburg", lat: 52.367, lng: 4.961, aliases: ["zeeburg"] },
  ],
  budapest: [
    { name: "Camping Római", lat: 47.582, lng: 19.05, aliases: ["romai", "római"] },
  ],
  venice: [
    { name: "Camping Fusina", lat: 45.42, lng: 12.255, aliases: ["fusina"] },
  ],
  venice_mestre: [
    { name: "Camping Fusina", lat: 45.42, lng: 12.255, aliases: ["fusina"] },
  ],
  /** Friuli — not Caorle's Centro Vacanze San Francesco. */
  san_daniele_del_friuli: [
    {
      name: "Area sosta camper San Daniele del Friuli",
      lat: 46.157,
      lng: 13.012,
      aliases: ["san daniele", "sosta san daniele", "pza san daniele"],
    },
  ],
  san_daniele: [
    {
      name: "Area sosta camper San Daniele del Friuli",
      lat: 46.157,
      lng: 13.012,
      aliases: ["san daniele", "sosta san daniele"],
    },
  ],
  lazise: [
    {
      name: "Camping Piani di Clodia",
      lat: 45.494,
      lng: 10.725,
      aliases: ["piani di clodia", "clodia"],
    },
  ],
  lake_garda: [
    {
      name: "Camping Piani di Clodia",
      lat: 45.494,
      lng: 10.725,
      aliases: ["piani di clodia", "lazise"],
    },
  ],
  milan: [
    { name: "Camping Città di Milano", lat: 45.516, lng: 9.09, aliases: ["citta di milano"] },
  ],
  rome: [
    { name: "Camping Fabulous", lat: 41.82, lng: 12.42, aliases: ["fabulous"] },
  ],
  florence: [
    { name: "Camping Michelangelo", lat: 43.763, lng: 11.268, aliases: ["michelangelo"] },
  ],
  barcelona: [
    { name: "Camping Barcelona", lat: 41.29, lng: 1.98, aliases: ["cunit", "vilanova"] },
  ],
  lisbon: [
    { name: "Lisboa Camping & Bungalows", lat: 38.76, lng: -9.22, aliases: ["lisboa camping", "monsanto"] },
  ],
  porto: [
    { name: "Orbitur Angeiras", lat: 41.25, lng: -8.72, aliases: ["angeiras"] },
  ],
  dubrovnik: [
    { name: "Camping Solitudo", lat: 42.66, lng: 18.07, aliases: ["solitudo"] },
  ],
  lake_bled: [
    { name: "Camping Bled", lat: 46.363, lng: 14.09, aliases: ["bled"] },
  ],
  bled: [
    { name: "Camping Bled", lat: 46.363, lng: 14.09, aliases: ["bled"] },
  ],
  salzburg: [
    { name: "Camping Kasern", lat: 47.83, lng: 13.05, aliases: ["kasern"] },
  ],
  innsbruck: [
    { name: "Camping Innsbruck Kranebitten", lat: 47.26, lng: 11.32, aliases: ["kranebitten"] },
  ],
  prague: [
    { name: "Camp Sokol Troja", lat: 50.12, lng: 14.42, aliases: ["sokol", "troja"] },
  ],
  berlin: [
    { name: "Campingplatz Am Krossinsee", lat: 52.37, lng: 13.64, aliases: ["krossinsee"] },
  ],
  athens: [
    { name: "Athens Camping", lat: 37.95, lng: 23.68, aliases: ["athens camp"] },
  ],
  santorini: [
    { name: "Camping Santorini", lat: 36.42, lng: 25.43, aliases: ["perissa"] },
  ],
};

function normalizeCityKey(city: string): string {
  return city
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

function cityLookupKeys(city: string): string[] {
  const key = normalizeCityKey(city);
  const keys = [key];
  // "Lake Bled" → bled; "Venice / Mestre" → venice
  const parts = key.split("_").filter(Boolean);
  if (parts.length > 1) {
    keys.push(parts[parts.length - 1]!);
    keys.push(parts.join("_"));
  }
  return keys;
}

function hubMatches(hub: CampgroundHub, campName: string): boolean {
  const n = campName.toLowerCase();
  if (n.includes(hub.name.toLowerCase().slice(0, 12))) return true;
  return (hub.aliases ?? []).some((a) => n.includes(a) || a.includes(n.slice(0, 10)));
}

/** Resolve lat/lng for a named camp near a city (catalog only — no network). */
export function resolveCampgroundCoords(
  city: string | undefined,
  campName: string,
): { lat: number; lng: number; matchedName: string } | null {
  if (!city?.trim() || !campName.trim()) return null;
  for (const key of cityLookupKeys(city)) {
    const hubs = CAMPGROUNDS_BY_CITY[key];
    if (!hubs?.length) continue;
    const hit = hubs.find((h) => hubMatches(h, campName));
    if (hit) return { lat: hit.lat, lng: hit.lng, matchedName: hit.name };
    // Fallback: first curated camp for that city when Gemini said "camp" generically.
    if (/\b(kamp|camp|camping|campground|campsite|avtokamp|rv\s*park)\b/i.test(campName)) {
      const first = hubs[0]!;
      return { lat: first.lat, lng: first.lng, matchedName: first.name };
    }
  }
  return null;
}

/** Default camp hub for a city (for empty motorhome nights). */
export function defaultCampgroundNearCity(
  city: string | undefined,
): { lat: number; lng: number; name: string } | null {
  if (!city?.trim()) return null;
  for (const key of cityLookupKeys(city)) {
    const hubs = CAMPGROUNDS_BY_CITY[key];
    if (hubs?.[0]) {
      return { lat: hubs[0].lat, lng: hubs[0].lng, name: hubs[0].name };
    }
  }
  return null;
}
