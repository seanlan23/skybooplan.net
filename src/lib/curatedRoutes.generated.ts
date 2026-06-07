/**
 * Default curated graphs for every supported country — from interestAnchors + hub IATA templates.
 * Agency-specific routes in curatedRoutes.ts take precedence (higher priority).
 */

import { getInterestAnchor } from "@/lib/interestAnchors";
import type { CuratedRoute } from "@/lib/curatedRoutes.types";

const BEACH_COUNTRIES = ["ID", "VN", "MY", "GR", "MX", "HR"] as const;

/** Countries with explicit agency graphs in curatedRoutes.agency.ts — skip anchor duplicate. */
const AGENCY_COVERED = new Set(["PH", "TH", "VN", "ID"]);

/** Hub-arrival IATA → default linear route (logic only, scales to nDays). */
const HUB_ROUTE_TEMPLATES: Array<{
  iata: string;
  country: string;
  minDays: number;
  segments: Array<[string, number]>;
  highlights: string[];
  steer: string;
}> = [
  {
    iata: "FCO",
    country: "IT",
    minDays: 8,
    segments: [
      ["Rome", 4],
      ["Florence", 3],
      ["Venice", 3],
      ["Milan", 0],
    ],
    highlights: ["Colosseum", "Vatican", "Uffizi", "Rialto Bridge"],
    steer: "Italija klasično: Rim → Firence → Benetke → Milano hub.",
  },
  {
    iata: "MXP",
    country: "IT",
    minDays: 8,
    segments: [
      ["Milan", 3],
      ["Florence", 3],
      ["Venice", 3],
      ["Rome", 0],
    ],
    highlights: ["Duomo Milan", "Uffizi", "St Mark's Square", "Colosseum"],
    steer: "Italija od severa: Milano → Firence → Benetke → Rim.",
  },
  {
    iata: "PAR",
    country: "FR",
    minDays: 7,
    segments: [["Paris", 0], ["Lyon", 3], ["Paris", 2]],
    highlights: ["Eiffel Tower", "Louvre", "Lyon old town"],
    steer: "Francija: Pariz → Lyon → Pariz (odlet).",
  },
  {
    iata: "LON",
    country: "GB",
    minDays: 7,
    segments: [["London", 0], ["Edinburgh", 3], ["London", 2]],
    highlights: ["Westminster", "Edinburgh Castle", "Royal Mile"],
    steer: "UK: London → Edinburgh → London buffer.",
  },
  {
    iata: "BCN",
    country: "ES",
    minDays: 7,
    segments: [["Barcelona", 0], ["Madrid", 3], ["Barcelona", 2]],
    highlights: ["Sagrada Familia", "Prado", "Gothic Quarter"],
    steer: "Španija: Barcelona → Madrid → Barcelona.",
  },
  {
    iata: "MAD",
    country: "ES",
    minDays: 7,
    segments: [["Madrid", 0], ["Barcelona", 3], ["Madrid", 2]],
    highlights: ["Prado", "Sagrada Familia", "Retiro Park"],
    steer: "Španija: Madrid → Barcelona → Madrid.",
  },
  {
    iata: "AGP",
    country: "ES",
    minDays: 7,
    segments: [["Málaga", 0], ["Seville", 3], ["Málaga", 2]],
    highlights: ["Alcázar Seville", "Alhambra day trip", "Costa del Sol"],
    steer: "Andaluzija: Málaga → Sevilja → Málaga.",
  },
  {
    iata: "NRT",
    country: "JP",
    minDays: 9,
    segments: [["Tokyo", 0], ["Kyoto", 4], ["Tokyo", 2]],
    highlights: ["Senso-ji", "Fushimi Inari", "Arashiyama"],
    steer: "Japonska: Tokyo → Kyoto → Tokyo odlet.",
  },
  {
    iata: "HND",
    country: "JP",
    minDays: 9,
    segments: [["Tokyo", 0], ["Kyoto", 4], ["Tokyo", 2]],
    highlights: ["Senso-ji", "Fushimi Inari", "Arashiyama"],
    steer: "Japonska: Tokyo → Kyoto → Tokyo odlet.",
  },
  {
    iata: "JRO",
    country: "TZ",
    minDays: 10,
    segments: [
      ["Arusha", 2],
      ["Serengeti", 5],
      ["Zanzibar", 0],
    ],
    highlights: ["Serengeti safari", "Ngorongoro", "Stone Town", "Nungwi Beach"],
    steer: "Tanzanija: safari sever → Zanzibar plaže.",
  },
  {
    iata: "ZNZ",
    country: "TZ",
    minDays: 10,
    segments: [
      ["Zanzibar", 0],
      ["Arusha", 2],
      ["Serengeti", 5],
    ],
    highlights: ["Stone Town", "Serengeti", "Ngorongoro"],
    steer: "Tanzanija: Zanzibar → safari loop.",
  },
  {
    iata: "YYZ",
    country: "CA",
    minDays: 14,
    segments: [
      ["Toronto", 3],
      ["Niagara Falls", 2],
      ["Ottawa", 2],
      ["Banff", 3],
      ["Vancouver", 3],
      ["Toronto", 0],
    ],
    highlights: ["Niagara Falls", "Banff National Park", "Vancouver Stanley Park"],
    steer: "Kanada loop: Toronto → Niagara → Ottawa → Banff → Vancouver → Toronto.",
  },
  {
    iata: "JFK",
    country: "US",
    minDays: 5,
    segments: [["New York", 0]],
    highlights: ["Central Park", "Statue of Liberty", "Brooklyn Bridge"],
    steer: "New York mestno potovanje.",
  },
  {
    iata: "LAX",
    country: "US",
    minDays: 5,
    segments: [["Los Angeles", 0]],
    highlights: ["Griffith Observatory", "Santa Monica", "Hollywood"],
    steer: "Los Angeles mestno + obala.",
  },
];

export function generatedBeachAnchorRoutes(): CuratedRoute[] {
  const out: CuratedRoute[] = [];
  for (const cc of BEACH_COUNTRIES) {
    if (AGENCY_COVERED.has(cc)) continue;
    const anchor = getInterestAnchor(cc, "beaches");
    if (!anchor) continue;
    out.push({
      id: `${cc.toLowerCase()}-beaches-default`,
      country: cc,
      minDays: 7,
      maxDays: 21,
      priority: 4,
      interests: ["beaches"],
      segments: anchor.routeTemplate,
      mustIncludeHighlights: anchor.mustIncludeHighlights,
      steer: anchor.steer,
    });
  }
  return out;
}

export function generatedHubRoutes(): CuratedRoute[] {
  return HUB_ROUTE_TEMPLATES.map((t) => ({
    id: `hub-${t.iata.toLowerCase()}`,
    country: t.country,
    minDays: t.minDays,
    maxDays: 21,
    priority: 3,
    segments: t.segments,
    mustIncludeHighlights: t.highlights,
    steer: t.steer,
    hubIata: t.iata,
  }));
}

export function hubRouteForIata(iata: string): CuratedRoute | undefined {
  const t = HUB_ROUTE_TEMPLATES.find((h) => h.iata === iata.toUpperCase());
  if (!t) return undefined;
  return {
    id: `hub-${t.iata.toLowerCase()}`,
    country: t.country,
    minDays: t.minDays,
    maxDays: 21,
    priority: 3,
    segments: t.segments,
    mustIncludeHighlights: t.highlights,
    steer: t.steer,
    hubIata: t.iata,
  };
}
