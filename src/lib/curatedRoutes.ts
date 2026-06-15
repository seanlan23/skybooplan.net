/**
 * Curated trip graphs — logistics for ALL destinations.
 * Agency patterns (high priority) + interest-anchor defaults + hub IATA templates.
 * Origin airport ignored; AI scales segments to user totalDays.
 */

import { lookupDestination } from "@/lib/destinationCoords";
import { getInterestAnchor } from "@/lib/interestAnchors";
import { parsePlannerInterestKeys } from "@/lib/plannerInterests";
import { COUNTRY_PATTERNS } from "@/lib/tripIntent";
import {
  generatedBeachAnchorRoutes,
  generatedHubRoutes,
  hubRouteForIata,
} from "@/lib/curatedRoutes.generated";
import { lookupLeg } from "@/lib/curatedRoutes.legs";
import type { CuratedRoute, CuratedTransportLeg } from "@/lib/curatedRoutes.types";

export type { CuratedRoute, CuratedTransportLeg } from "@/lib/curatedRoutes.types";

// —— Agency-derived graphs (highest priority) ——

const PH_PALAWAN_CLASSIC: CuratedRoute = {
  id: "ph-palawan-pps-portbarton",
  country: "PH",
  minDays: 9,
  maxDays: 13,
  priority: 10,
  wishTest: /palawan|puerto princesa|port barton|honda bay|sabang|underground river/i,
  interests: ["beaches", "nature"],
  segments: [
    ["Manila", 2],
    ["Puerto Princesa", 3],
    ["Port Barton", 3],
    ["Manila", 1],
  ],
  mustIncludeHighlights: [
    "Puerto Princesa",
    "Honda Bay",
    "Sabang Underground River",
    "Port Barton",
    "Island hopping",
  ],
  steer: "Palawan: Manila → MNL→PPS → baza PPS → Port Barton → nazaj Manila.",
};

const PH_LUZON_BOHOL_PALAWAN: CuratedRoute = {
  id: "ph-luzon-bohol-palawan",
  country: "PH",
  minDays: 15,
  maxDays: 21,
  priority: 20,
  wishTest: /banaue|batad|rižev|rizev|cordillera|trek|hapao|grand tour/i,
  interests: ["beaches", "nature", "sights"],
  segments: [
    ["Manila", 1],
    ["Banaue", 4],
    ["Manila", 1],
    ["Bohol", 3],
    ["Puerto Princesa", 2],
    ["Port Barton", 3],
    ["Manila", 2],
  ],
  mustIncludeHighlights: ["Banaue Rice Terraces", "Chocolate Hills", "Honda Bay", "Port Barton"],
  steer: "Filipini grand tour: Luzon → Bohol → Palawan → Manila buffer.",
};

const PH_BEACHES_EL_NIDO_BORACAY: CuratedRoute = {
  id: "ph-beaches-elnido-boracay",
  country: "PH",
  minDays: 12,
  maxDays: 21,
  priority: 15,
  wishTest: /el nido|boracay|big lagoon|white beach/i,
  interests: ["beaches"],
  segments: [
    ["Manila", 1],
    ["El Nido", 0],
    ["Bohol", 0],
    ["Boracay", 0],
    ["Manila", 2],
  ],
  mustIncludeHighlights: ["El Nido", "Big Lagoon", "Boracay", "White Beach"],
  steer: "Intenzivne plaže PH: El Nido → Bohol → Boracay → Manila.",
};

const VN_KH_ANGKOR: CuratedRoute = {
  id: "vn-kh-angkor-classic",
  country: "VN+KH",
  routeCountries: ["VN", "KH"],
  minDays: 12,
  maxDays: 16,
  priority: 25,
  wishTest: /kambodž|cambodia|angkor|siem reap|phnom penh|khmer/i,
  interests: ["sights", "nature"],
  segments: [
    ["Hanoi", 3],
    ["Ha Long Bay", 1],
    ["Hue", 1],
    ["Hoi An", 1],
    ["Ho Chi Minh City", 2],
    ["Mekong Delta", 1],
    ["Phnom Penh", 1],
    ["Siem Reap", 2],
  ],
  mustIncludeHighlights: [
    "Ha Long Bay",
    "Hoi An",
    "Mekong Delta",
    "Angkor Wat",
    "Cu Chi Tunnels",
  ],
  steer: "VN+KH: Hanoi → Halong → vlak Hue → Hoi An → SGN → Mekong → Kambodža → Angkor.",
};

const VN_KH_TH_GRAND: CuratedRoute = {
  id: "vn-kh-th-grand",
  country: "VN+KH+TH",
  routeCountries: ["VN", "KH", "TH"],
  minDays: 16,
  maxDays: 21,
  priority: 30,
  wishTest: /rayong|pattaya|tajsk.*kambodž|kambodž.*tajsk/i,
  interests: ["sights", "beaches"],
  segments: [
    ["Hanoi", 3],
    ["Ha Long Bay", 1],
    ["Hue", 1],
    ["Hoi An", 1],
    ["Ho Chi Minh City", 2],
    ["Mekong Delta", 1],
    ["Phnom Penh", 1],
    ["Siem Reap", 2],
    ["Rayong", 2],
    ["Bangkok", 1],
  ],
  mustIncludeHighlights: ["Angkor Wat", "Ha Long Bay", "Rayong", "Bangkok"],
  steer: "VN+KH+TH do Angkorja → Rayong počitnice → Bangkok odlet.",
};

const VN_NORTH_SOUTH: CuratedRoute = {
  id: "vn-north-south",
  country: "VN",
  minDays: 9,
  maxDays: 13,
  priority: 12,
  interests: ["sights", "nature"],
  segments: [
    ["Hanoi", 3],
    ["Ha Long Bay", 1],
    ["Hue", 1],
    ["Hoi An", 1],
    ["Ho Chi Minh City", 0],
  ],
  mustIncludeHighlights: ["Hanoi", "Ha Long Bay", "Hue", "Hoi An", "Ho Chi Minh City"],
  steer: "Vietnam sever→jug brez Kambodže.",
};

/** Agency 9d: Bangkok → Kanchanaburi → Chiang Mai → Bangkok (brez otoka). */
const TH_CLASSIC_SHORT: CuratedRoute = {
  id: "th-classic-short",
  country: "TH",
  hubIata: "BKK",
  minDays: 8,
  maxDays: 9,
  priority: 16,
  wishTest: /kanchanaburi|kwai|erawan|ayutthaya|doi suthep|chiang mai/i,
  interests: ["sights", "nature"],
  segments: [
    ["Bangkok", 3],
    ["Kanchanaburi", 2],
    ["Chiang Mai", 2],
    ["Bangkok", 1],
  ],
  mustIncludeHighlights: [
    "Grand Palace",
    "Wat Pho",
    "Wat Arun",
    "Kanchanaburi",
    "Bridge on the River Kwai",
    "Erawan National Park",
    "Ayutthaya",
    "Chiang Mai",
    "Doi Suthep",
  ],
  steer:
    "Tajska kratka zanka: Bangkok → Kanchanaburi (Kwai, Erawan) → let Chiang Mai → nazaj Bangkok odlet. Brez otoka.",
};

/** Agency 12d: Bangkok → Kanchanaburi → Chiang Mai → Ko Samet → Bangkok. */
const TH_CLASSIC_CIRCLE: CuratedRoute = {
  id: "th-classic-circle",
  country: "TH",
  hubIata: "BKK",
  minDays: 10,
  maxDays: 14,
  priority: 14,
  wishTest: /kanchanaburi|kwai|erawan|ko samet|koh samet|samet|tigri|sloni/i,
  interests: ["sights", "nature", "beaches"],
  segments: [
    ["Bangkok", 3],
    ["Kanchanaburi", 2],
    ["Chiang Mai", 3],
    ["Ko Samet", 3],
    ["Bangkok", 1],
  ],
  mustIncludeHighlights: [
    "Grand Palace",
    "Wat Pho",
    "Wat Arun",
    "Kanchanaburi",
    "Bridge on the River Kwai",
    "Erawan National Park",
    "Ayutthaya",
    "Chiang Mai",
    "Doi Suthep",
    "Ko Samet",
  ],
  steer:
    "Tajska klasika: Bangkok (templji) → Kanchanaburi (Kwai, Erawan) → let Chiang Mai → Ko Samet počitnice → Bangkok buffer.",
};

/** Andaman beaches — Krabi + Koh Lipe (interest anchor logic). */
const TH_BEACHES_ANDAMAN: CuratedRoute = {
  id: "th-beaches-andaman",
  country: "TH",
  hubIata: "BKK",
  minDays: 12,
  maxDays: 21,
  priority: 13,
  wishTest: /koh lipe|lipe|krabi|phi phi|maya bay|andaman|railay/i,
  interests: ["beaches"],
  segments: [
    ["Bangkok", 2],
    ["Ayutthaya", 1],
    ["Chiang Mai", 2],
    ["Krabi", 0],
    ["Koh Lipe", 0],
    ["Bangkok", 2],
  ],
  mustIncludeHighlights: [
    "Grand Palace",
    "Wat Pho",
    "Koh Phi Phi",
    "Maya Bay",
    "Koh Lipe",
    "Railay Beach",
  ],
  steer:
    "Tajska plaže: Bangkok → Ayutthaya → Chiang Mai → Krabi (Phi Phi) → Koh Lipe → Bangkok buffer ≥2 dni.",
};

/** Agency 16d: Java → Sulawesi/Toraja → Bali → Flores/Komodo → Jakarta. */
const ID_GRAND_CIRCLE: CuratedRoute = {
  id: "id-grand-circle",
  country: "ID",
  hubIata: "CGK",
  minDays: 14,
  maxDays: 18,
  priority: 18,
  wishTest: /toraja|tana toraja|komodo|wae rebo|flores|labuan bajo|makassar|sulawesi|batur/i,
  interests: ["sights", "nature"],
  segments: [
    ["Jakarta", 1],
    ["Makassar", 1],
    ["Tana Toraja", 4],
    ["Ubud", 2],
    ["Labuan Bajo", 5],
    ["Jakarta", 1],
  ],
  mustIncludeHighlights: [
    "Jakarta",
    "Tana Toraja",
    "Ubud",
    "Mount Batur",
    "Tanah Lot",
    "Labuan Bajo",
    "Komodo National Park",
    "Padar Island",
    "Wae Rebo",
  ],
  steer:
    "Indonezija grand tour: Jakarta hub → let Makassar → Toraja (trek) → let Bali (Ubud, Batur) → let Labuan Bajo (Wae Rebo + 2d Komodo cruise) → Jakarta odlet.",
};

const AGENCY_ROUTES: CuratedRoute[] = [
  VN_KH_TH_GRAND,
  VN_KH_ANGKOR,
  ID_GRAND_CIRCLE,
  PH_LUZON_BOHOL_PALAWAN,
  PH_BEACHES_EL_NIDO_BORACAY,
  PH_PALAWAN_CLASSIC,
  VN_NORTH_SOUTH,
  TH_CLASSIC_SHORT,
  TH_CLASSIC_CIRCLE,
  TH_BEACHES_ANDAMAN,
];

function vnDefaultRoute(nDays: number, keys: string[]): CuratedRoute | null {
  if (nDays >= 9 && !keys.includes("beaches")) return VN_NORTH_SOUTH;
  const anchor = getInterestAnchor("VN", "beaches");
  if (!anchor || !keys.includes("beaches")) return null;
  return {
    id: "vn-beaches-default",
    country: "VN",
    minDays: 7,
    maxDays: 21,
    priority: 4,
    segments: anchor.routeTemplate,
    mustIncludeHighlights: anchor.mustIncludeHighlights,
    steer: anchor.steer,
    interests: ["beaches"],
  };
}

function phDefaultRoute(nDays: number, keys: string[]): CuratedRoute | null {
  if (nDays >= 9) return PH_PALAWAN_CLASSIC;
  const anchor = getInterestAnchor("PH", keys.includes("beaches") ? "beaches" : "sights");
  if (!anchor) return null;
  return {
    id: "ph-default",
    country: "PH",
    minDays: 7,
    maxDays: 21,
    priority: 6,
    segments: anchor.routeTemplate,
    mustIncludeHighlights: anchor.mustIncludeHighlights,
    steer: anchor.steer,
    interests: keys.includes("beaches") ? ["beaches"] : ["sights"],
  };
}

function idDefaultRoute(nDays: number, keys: string[], w: string): CuratedRoute | null {
  if (nDays >= 14 && ID_GRAND_CIRCLE.wishTest?.test(w)) return ID_GRAND_CIRCLE;
  const anchor = getInterestAnchor("ID", "beaches");
  if (!anchor || !keys.includes("beaches")) return null;
  return {
    id: "id-beaches-default",
    country: "ID",
    hubIata: "DPS",
    minDays: 7,
    maxDays: 21,
    priority: 4,
    segments: anchor.routeTemplate,
    mustIncludeHighlights: anchor.mustIncludeHighlights,
    steer: anchor.steer,
    interests: ["beaches"],
  };
}

function thDefaultRoute(nDays: number, keys: string[]): CuratedRoute | null {
  if (keys.includes("beaches") && nDays >= 12) return TH_BEACHES_ANDAMAN;
  if (nDays >= 8 && nDays <= 9) return TH_CLASSIC_SHORT;
  if (nDays >= 10 && nDays <= 14) return TH_CLASSIC_CIRCLE;
  const anchor = getInterestAnchor("TH", "beaches");
  if (!anchor) return null;
  return {
    id: "th-default",
    country: "TH",
    hubIata: "BKK",
    minDays: 7,
    maxDays: 21,
    priority: 6,
    segments: anchor.routeTemplate,
    mustIncludeHighlights: anchor.mustIncludeHighlights,
    steer: anchor.steer,
    interests: ["beaches"],
  };
}

function getAllRoutes(): CuratedRoute[] {
  return [...AGENCY_ROUTES, ...generatedBeachAnchorRoutes(), ...generatedHubRoutes()];
}

function detectCountriesInText(wishes?: string): string[] {
  const w = wishes ?? "";
  const found: string[] = [];
  for (const { code, test } of COUNTRY_PATTERNS) {
    if (test.test(w) && !found.includes(code)) found.push(code);
  }
  return found;
}

export function inferTripCountries(
  destinationIata: string,
  returnFromIata?: string,
  wishes?: string,
): string[] {
  const fromText = detectCountriesInText(wishes);
  const fromFlights: string[] = [];
  const dest = lookupDestination(destinationIata)?.country;
  const ret = returnFromIata ? lookupDestination(returnFromIata)?.country : undefined;
  if (dest) fromFlights.push(dest);
  if (ret && ret !== dest) fromFlights.push(ret);
  const out = [...fromText];
  for (const c of fromFlights) {
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

export function countryForCuratedRoutes(destinationIata: string): string | null {
  return lookupDestination(destinationIata)?.country ?? null;
}

function routeMatchesCountries(route: CuratedRoute, tripCountries: string[]): boolean {
  if (!route.routeCountries?.length) {
    return tripCountries.includes(route.country);
  }
  return route.routeCountries.every((c) => tripCountries.includes(c));
}

function isRouteEligible(
  route: CuratedRoute,
  w: string,
  keys: ReturnType<typeof parsePlannerInterestKeys>,
  tripCountries: string[],
  nDays: number,
): boolean {
  if (route.id === "ph-luzon-bohol-palawan") {
    return (
      route.wishTest?.test(w) ||
      (keys.includes("nature") && keys.includes("sights") && nDays >= 16)
    );
  }
  if (route.id === "vn-kh-th-grand") {
    return (
      route.wishTest?.test(w) ||
      (tripCountries.includes("TH") && tripCountries.includes("KH") && nDays >= 16)
    );
  }
  if (route.id === "vn-kh-angkor-classic") {
    if (tripCountries.includes("TH") && !route.wishTest?.test(w)) return false;
    return (
      route.wishTest?.test(w) ||
      (tripCountries.includes("KH") && !tripCountries.includes("TH"))
    );
  }
  if (route.id === "vn-north-south") return !tripCountries.includes("KH");
  if (route.id === "th-beaches-andaman" && route.wishTest?.test(w)) return true;
  if (route.id === "th-classic-circle") {
    return route.wishTest?.test(w) || (nDays >= 10 && /samet|otok/i.test(w));
  }
  if (route.id === "th-classic-short" && nDays <= 9) return true;
  if (route.id === "id-grand-circle") {
    return route.wishTest?.test(w) || (nDays >= 14 && keys.includes("nature"));
  }
  if (route.interests?.length) {
    const interestMatch = route.interests.some((i) => keys.includes(i));
    if (!interestMatch && route.priority < 10) return false;
  }
  return true;
}

/** Best curated graph for destination + duration; scales via templateToBlocks. */
export function matchCuratedRoute(
  nDays: number,
  destinationIata: string,
  priorities?: string[],
  wishes?: string,
  returnFromIata?: string,
): CuratedRoute | null {
  const tripCountries = inferTripCountries(destinationIata, returnFromIata, wishes);
  if (!tripCountries.length) return null;

  const w = (wishes ?? "").toLowerCase();
  const keys = parsePlannerInterestKeys(priorities ?? []);
  const iata = destinationIata.toUpperCase();

  let candidates = getAllRoutes().filter(
    (r) =>
      nDays >= r.minDays &&
      nDays <= r.maxDays &&
      routeMatchesCountries(r, tripCountries),
  );

  if (candidates.length === 0) {
    const hub = hubRouteForIata(iata);
    if (hub && nDays >= hub.minDays && tripCountries.includes(hub.country)) {
      return hub;
    }
    const destCountry = lookupDestination(destinationIata)?.country;
    if (destCountry === "TH") return thDefaultRoute(nDays, keys);
    if (destCountry === "VN" && !tripCountries.includes("KH")) {
      return vnDefaultRoute(nDays, keys);
    }
    if (destCountry === "PH") return phDefaultRoute(nDays, keys);
    if (destCountry === "ID") return idDefaultRoute(nDays, keys, w);
    return null;
  }

  const eligible = candidates.filter((r) =>
    isRouteEligible(r, w, keys, tripCountries, nDays),
  );

  const scored = (eligible.length ? eligible : candidates)
    .map((r) => {
      let score = r.priority;
      if (r.wishTest?.test(w)) score += 50;
      if (r.hubIata === iata) score += 8;
      if (r.interests?.some((i) => keys.includes(i))) score += 5;
      return { route: r, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.route ?? null;
}

export function lookupCuratedTransportLeg(
  fromCity: string,
  toCity: string,
  _country?: string,
): CuratedTransportLeg | null {
  return lookupLeg(fromCity, toCity);
}

export function curatedRouteMeta(route: CuratedRoute): {
  routeId: string;
  mustIncludeHighlights: string[];
  steer: string;
  segments: Array<[string, number]>;
} {
  return {
    routeId: route.id,
    mustIncludeHighlights: route.mustIncludeHighlights,
    steer: route.steer,
    segments: route.segments,
  };
}

export function resolveCuratedBlueprint(
  nDays: number,
  destinationIata: string,
  templateToBlocks: (
    template: Array<[string, number]>,
    days: number,
  ) => Array<{ city: string; startDay: number; endDay: number }>,
  priorities?: string[],
  wishes?: string,
  returnFromIata?: string,
): Array<{ city: string; startDay: number; endDay: number }> | undefined {
  const route = matchCuratedRoute(
    nDays,
    destinationIata,
    priorities,
    wishes,
    returnFromIata,
  );
  if (!route) return undefined;
  return templateToBlocks(route.segments, nDays);
}

export function buildCuratedRoutePayload(
  nDays: number,
  destinationIata: string,
  priorities?: string[],
  wishes?: string,
  returnFromIata?: string,
): Record<string, unknown> | undefined {
  const route = matchCuratedRoute(
    nDays,
    destinationIata,
    priorities,
    wishes,
    returnFromIata,
  );
  if (!route) return undefined;
  return {
    curatedRoute: curatedRouteMeta(route),
    curatedRouteRule:
      "curatedRoute je globalni logistični graf (vse destinacije). Sledi vrstnemu redu regij in prevoznim nogam; AI prilagodi dolžine segmentov na totalDays — brez teleporta. Izhodišče (LJU/MXP/…) je izven grafa.",
    regionBlueprint: templateToBlueprintBlocks(route.segments, nDays),
  };
}

export type RegionBlueprintBlock = { city: string; startDay: number; endDay: number };

/** Scale agency segment template to total trip days (same logic as aiPlan skeleton). */
export function templateToBlueprintBlocks(
  template: Array<[string, number]>,
  nDays: number,
): RegionBlueprintBlock[] {
  const segments: Array<{ city: string; days: number }> = [];
  const fixedDays = template.filter(([, d]) => d > 0).reduce((sum, [, d]) => sum + d, 0);
  const flexCities = template.filter(([, d]) => d === 0);
  const flexTotal = Math.max(0, nDays - fixedDays);
  const flexEach = flexCities.length ? Math.max(1, Math.floor(flexTotal / flexCities.length)) : 0;

  for (const [city, days] of template) {
    segments.push({ city, days: days > 0 ? days : flexEach });
  }

  let day = 1;
  const blocks: RegionBlueprintBlock[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const span = i === segments.length - 1 ? nDays - day + 1 : seg.days;
    const endDay = Math.min(nDays, day + Math.max(1, span) - 1);
    blocks.push({ city: seg.city, startDay: day, endDay });
    day = endDay + 1;
    if (day > nDays) break;
  }

  const last = blocks[blocks.length - 1];
  if (last && last.endDay !== nDays) {
    last.endDay = nDays;
  }
  return blocks;
}

/** Prompt block for Gemini catalog — mirrors curatedRoute in legacy aiPlan JSON payload. */
export function buildCuratedRoutePromptBlock(opts: {
  nDays: number;
  destinationIata: string;
  priorities?: string[];
  wishes?: string;
  returnFromIata?: string;
}): string | undefined {
  const route = matchCuratedRoute(
    opts.nDays,
    opts.destinationIata,
    opts.priorities,
    opts.wishes,
    opts.returnFromIata,
  );
  if (!route) return undefined;

  const meta = curatedRouteMeta(route);
  const blueprint = templateToBlueprintBlocks(meta.segments, opts.nDays);
  const blueprintLines = blueprint
    .map((b) => `  • Dan ${b.startDay}–${b.endDay}: ${b.city}`)
    .join("\n");

  return `
=== KURIRANA POT (OBVEZNO — ima prednost pred splošnimi pravili o mestih) ===
${meta.steer}

regionBlueprint — vsaka faza itinerar[] = ena baza; city mora ustrezati (NE podaljšuj enega mesta dlje):
${blueprintLines}

mustIncludeHighlights (vključi kot realne POI / aktivnosti):
${meta.mustIncludeHighlights.map((h) => `- ${h}`).join("\n")}

Pravila kurirane poti:
- Strogo sledi vrstnemu redu mest iz regionBlueprint — enosmerna pot, brez teleporta.
- Med fazami obvezno transportation[] (let/trajekt/vlak/kombi) in aktivnosti prevoza.
- Hub mesto (npr. Bangkok, Manila) na začetku/koncu: kratka postavka za prilet/odlet — ne zapolni celotnega dopusta v enem mestu.
- Število dni na mesto prilagodi na ${opts.nDays} dni skupaj, a NE spreminjaj vrstnega reda regij.
===`;
}
