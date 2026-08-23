/**
 * Curated trip graphs — logistics for ALL destinations.
 * Agency patterns (high priority) + interest-anchor defaults + hub IATA templates.
 * Origin airport ignored; AI scales segments to user totalDays.
 * Prompt treats these as a hint (worldRouteRules). Do not add if (18 days → extra city) here.
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
import { minStayNights, stayFactsPromptBlock } from "@/lib/stayFacts";

export type { CuratedRoute, CuratedTransportLeg } from "@/lib/curatedRoutes.types";

// —— Agency-derived graphs (highest priority) ——

const PH_PALAWAN_CLASSIC: CuratedRoute = {
  id: "ph-palawan-pps-portbarton",
  country: "PH",
  minDays: 9,
  maxDays: 18,
  priority: 10,
  wishTest: /palawan|puerto princesa|port barton|honda bay|sabang|underground river/i,
  interests: ["beaches", "nature"],
  // 0 = flex: surplus days go to islands, NEVER to final Manila hub.
  segments: [
    ["Manila", 1],
    ["Puerto Princesa", 0],
    ["Port Barton", 0],
    ["Manila", 2],
  ],
  mustIncludeHighlights: [
    "Puerto Princesa",
    "Honda Bay",
    "Sabang Underground River",
    "Port Barton",
    "Island hopping",
  ],
  steer:
    "Palawan: Manila hub (prihod 1 dan) → MNL→PPS → baza PPS → Port Barton → nazaj Manila (max 2 dni buffer). Odvečne dni dodaj na PPS/Port Barton — ne na Manilo.",
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
  maxDays: 32,
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
  steer:
    "Intenzivne plaže PH: El Nido → Bohol → Boracay → Manila buffer. Prva Manila = prihod (1 dan); zadnja Manila max 2–3 dni — odvečne dni na otoke/plaže.",
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
    "Mae Klong Railway Market",
    "Damnoen Saduak Floating Market",
    "Kanchanaburi War Cemetery",
    "Bridge on the River Kwai",
    "Tham Krasae Death Railway",
    "Kanchanaburi",
    "Erawan National Park",
    "Ayutthaya",
    "Chiang Mai",
    "Doi Suthep",
  ],
  steer:
    "Tajska kratka zanka: Bangkok (templji + 1 celodnevni izlet Mae Klong→Damnoen→Kwai→Death Railway→Sai Yok, start 6:30 izpred hotela) → Kanchanaburi/Chiang Mai po potrebi → Bangkok odlet. Hotel vedno generično „tvoj hotel“, ne brand.",
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
    "Mae Klong Railway Market",
    "Damnoen Saduak Floating Market",
    "Kanchanaburi War Cemetery",
    "Bridge on the River Kwai",
    "Tham Krasae Death Railway",
    "Kanchanaburi",
    "Erawan National Park",
    "Ayutthaya",
    "Chiang Mai",
    "Doi Suthep",
    "Ko Samet",
  ],
  steer:
    "Tajska klasika: Bangkok (templji + 1 celodnevni izlet Mae Klong→Damnoen→Kwai→Death Railway→Sai Yok, start 6:30 izpred hotela — brez imena hotela) → Kanchanaburi → Chiang Mai → Ko Samet → Bangkok buffer.",
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
    ["Bangkok", 3],
    ["Chiang Mai", 2],
    ["Krabi", 3],
    ["Koh Lipe", 5],
    ["Bangkok", 2],
  ],
  mustIncludeHighlights: [
    "Grand Palace",
    "Wat Pho",
    "Ayutthaya",
    "Koh Phi Phi",
    "Maya Bay",
    "Koh Lipe",
    "Railay Beach",
  ],
  steer:
    "Tajska plaže (PREDLOG, ne ukaz): Bangkok → Chiang Mai → Andaman (Krabi in/ali sosednja obala) → dolg-dostopni otok samo z dovolj nočmi → Bangkok pred odhodom. Model sme dodati bazo, ko koledar drži — ne 5 dni v enem letovišču.",
};

/**
 * South Thailand when the international flight lands at Phuket/Krabi.
 * Must NOT start in Bangkok (that invents a bogus HKT→BKK day-1 hop).
 */
const TH_PHUKET_ANDAMAN: CuratedRoute = {
  id: "th-phuket-andaman",
  country: "TH",
  hubIata: "HKT",
  minDays: 8,
  maxDays: 21,
  priority: 28,
  wishTest: /phuket|hkt|patong|kata|karon|rawai|andaman/i,
  interests: ["beaches"],
  segments: [
    ["Phuket", 4],
    ["Krabi", 0],
    ["Koh Lipe", 4],
    ["Phuket", 2],
  ],
  mustIncludeHighlights: [
    "Old Phuket Town",
    "Patong Beach",
    "Koh Phi Phi",
    "Maya Bay",
    "Railay Beach",
    "Koh Lipe",
    "Sunrise Beach (Koh Lipe)",
  ],
  steer:
    "Prihod HKT/KBV: Dan 1 = Phuket (ali Krabi). BREZ notranjega leta na Bangkok na dan 1. Andaman: Phuket → Krabi/Phi Phi → Koh Lipe ≥4 noči (sicer izpusti otok) → nazaj Phuket za mednarodni odhod. Bangkok samo če je odhod eksplicitno iz BKK.",
};

/** North Thailand when landing at Chiang Mai. */
const TH_CHIANGMAI_NORTH: CuratedRoute = {
  id: "th-chiangmai-north",
  country: "TH",
  hubIata: "CNX",
  minDays: 8,
  maxDays: 21,
  priority: 28,
  wishTest: /chiang mai|chiangmai|cnx|doi suthep|pai/i,
  interests: ["sights", "nature"],
  segments: [
    ["Chiang Mai", 4],
    ["Chiang Rai", 0],
    ["Pai", 0],
    ["Chiang Mai", 2],
  ],
  mustIncludeHighlights: [
    "Doi Suthep",
    "Old City Chiang Mai",
    "Sunday Walking Street",
    "White Temple",
    "Pai Canyon",
  ],
  steer:
    "Prihod CNX: Dan 1 = Chiang Mai. BREZ notranjega leta CNX→BKK na dan 1. Sever: Chiang Mai → Chiang Rai/Pai → nazaj Chiang Mai za odhod.",
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

/** Botswana: capital = flight buffer only; surplus → Maun / pans / Chobe. */
const BW_CLASSIC_DELTA_CHOBE: CuratedRoute = {
  id: "bw-classic-delta-chobe",
  country: "BW",
  hubIata: "GBE",
  minDays: 10,
  maxDays: 21,
  priority: 30,
  wishTest:
    /botswana|bocvana|botsvana|gaborone|maun|okavango|chobe|kasane|makgadikgadi|kalahari/i,
  interests: ["nature", "sights"],
  // 0 = flex: surplus days go to wilderness, NEVER to final Gaborone hub.
  segments: [
    ["Gaborone", 1],
    ["Maun", 0],
    ["Makgadikgadi", 0],
    ["Kasane", 0],
    ["Gaborone", 1],
  ],
  mustIncludeHighlights: [
    "Okavango Delta day trip",
    "Moremi / Maun safari",
    "Makgadikgadi Pans",
    "Chobe National Park",
  ],
  steer:
    "Bocvana: Gaborone (1 dan prihod) → Maun/Okavango day-access → Makgadikgadi → Kasane/Chobe → Gaborone (1 dan odlet). PREPOVEDANO: 3+ dni Gaborone / shopping malls. Odvečne dni na Maun/Makgadikgadi/Kasane.",
};

/** Namibia classic loop: Windhoek buffers only; surplus → desert/coast/Etosha. */
const NA_CLASSIC_LOOP: CuratedRoute = {
  id: "na-classic-loop",
  country: "NA",
  hubIata: "WDH",
  minDays: 10,
  maxDays: 21,
  priority: 30,
  wishTest:
    /namibia|namibija|windhoek|etosha|sossusvlei|sesriem|swakopmund|damaraland/i,
  interests: ["nature", "sights"],
  segments: [
    ["Windhoek", 1],
    ["Sesriem", 0],
    ["Swakopmund", 0],
    ["Damaraland", 0],
    ["Etosha", 0],
    ["Windhoek", 1],
  ],
  mustIncludeHighlights: [
    "Sossusvlei",
    "Deadvlei",
    "Swakopmund",
    "Damaraland",
    "Etosha National Park",
  ],
  steer:
    "Namibija road-trip: Windhoek (1) → Sesriem/Sossusvlei → Swakopmund → Damaraland → Etosha (več dni) → Windhoek (1 dan odlet). PREPOVEDANO: Otjiwarongo 2+ dni, Windhoek shopping 2+ dni na koncu. Odvečne dni na Etosha/Damaraland/Sesriem/obalo.",
};

/** South Africa via Johannesburg: hub buffer only; surplus → Kruger. */
const ZA_JNB_KRUGER: CuratedRoute = {
  id: "za-jnb-kruger",
  country: "ZA",
  hubIata: "JNB",
  minDays: 8,
  maxDays: 21,
  priority: 30,
  wishTest: /kruger|johannesburg|jnb|mpumalanga|sabie|hoedspruit/i,
  interests: ["nature", "sights"],
  segments: [
    ["Johannesburg", 1],
    ["Kruger", 0],
    ["Johannesburg", 1],
  ],
  mustIncludeHighlights: [
    "Kruger National Park",
    "Game drive",
    "Panorama Route / Blyde River",
  ],
  steer:
    "JAR prek JNB: Johannesburg (1 dan prihod) → Kruger / Mpumalanga (več dni) → Johannesburg (1 dan odlet). PREPOVEDANO: 3+ dni Johannesburg malls. Odvečne dni na Kruger.",
};

/** Longer JAR: Kruger + Cape Town; Johannesburg only as arrival buffer when flying JNB. */
const ZA_JNB_KRUGER_CAPE: CuratedRoute = {
  id: "za-jnb-kruger-cape",
  country: "ZA",
  hubIata: "JNB",
  minDays: 14,
  maxDays: 21,
  priority: 28,
  wishTest: /cape town|kapsko|garden route|stellenbosch|kruger.*cape|cape.*kruger/i,
  interests: ["nature", "sights", "beaches"],
  segments: [
    ["Johannesburg", 1],
    ["Kruger", 0],
    ["Cape Town", 0],
    ["Johannesburg", 1],
  ],
  mustIncludeHighlights: [
    "Kruger National Park",
    "Table Mountain",
    "Cape Point",
    "Stellenbosch",
  ],
  steer:
    "JAR: Johannesburg (1) → Kruger → Cape Town (destinacija) → Johannesburg (1 odlet). Odvečne dni na Kruger/Cape Town — ne na Johannesburg.",
};

/** Cape Town as real destination (Garden Route), not a thin gateway. */
const ZA_CPT_GARDEN: CuratedRoute = {
  id: "za-cpt-garden",
  country: "ZA",
  hubIata: "CPT",
  minDays: 8,
  maxDays: 18,
  priority: 30,
  wishTest: /cape town|kapsko|garden route|stellenbosch|hermanus|cape point/i,
  interests: ["nature", "sights", "beaches"],
  segments: [
    ["Cape Town", 0],
    ["Garden Route", 0],
    ["Cape Town", 2],
  ],
  mustIncludeHighlights: [
    "Table Mountain",
    "Cape Point",
    "Stellenbosch",
    "Garden Route",
  ],
  steer:
    "JAR Cape Town: Cape Town (destinacija) → Garden Route → Cape Town buffer pred odletom. Cape Town sme dobiti več dni — ni samo hub.",
};

/** Kenya: Nairobi = flight buffer; surplus → Mara / Amboseli. */
const KE_CLASSIC_MARA: CuratedRoute = {
  id: "ke-classic-mara",
  country: "KE",
  hubIata: "NBO",
  minDays: 8,
  maxDays: 21,
  priority: 30,
  wishTest: /kenya|kenija|nairobi|maasai mara|masai mara|amboseli|nakuru|tsavo/i,
  interests: ["nature", "sights"],
  segments: [
    ["Nairobi", 1],
    ["Maasai Mara", 0],
    ["Amboseli", 0],
    ["Nairobi", 1],
  ],
  mustIncludeHighlights: [
    "Maasai Mara",
    "Game drive",
    "Amboseli National Park",
    "Kilimanjaro views",
  ],
  steer:
    "Kenija: Nairobi (1 dan prihod) → Maasai Mara → Amboseli → Nairobi (1 dan odlet). PREPOVEDANO: 3+ dni Nairobi malls / city walks. Odvečne dni na Mara/Amboseli.",
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
  TH_PHUKET_ANDAMAN,
  TH_CHIANGMAI_NORTH,
  BW_CLASSIC_DELTA_CHOBE,
  NA_CLASSIC_LOOP,
  ZA_JNB_KRUGER_CAPE,
  ZA_JNB_KRUGER,
  ZA_CPT_GARDEN,
  KE_CLASSIC_MARA,
];

/** Non-BKK Thailand arrival airports → start the trip there, not in Bangkok. */
const TH_ARRIVAL_HUB_ROUTES: Record<string, CuratedRoute> = {
  HKT: TH_PHUKET_ANDAMAN,
  KBV: { ...TH_PHUKET_ANDAMAN, hubIata: "KBV", id: "th-krabi-andaman" },
  CNX: TH_CHIANGMAI_NORTH,
};

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
  // Long beach trips: multi-island flex graph (not Palawan-classic with fixed days).
  if (keys.includes("beaches") && nDays >= 14) {
    return { ...PH_BEACHES_EL_NIDO_BORACAY, id: "ph-beaches-default", priority: 8 };
  }
  if (nDays >= 9 && nDays <= PH_PALAWAN_CLASSIC.maxDays) return PH_PALAWAN_CLASSIC;
  const anchor = getInterestAnchor("PH", keys.includes("beaches") ? "beaches" : "sights");
  if (!anchor) return null;
  return {
    id: "ph-default",
    country: "PH",
    minDays: 7,
    maxDays: 35,
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

function thDefaultRoute(
  nDays: number,
  keys: string[],
  destinationIata?: string,
): CuratedRoute | null {
  const iata = (destinationIata ?? "").toUpperCase();
  const arrivalHub = TH_ARRIVAL_HUB_ROUTES[iata];
  if (arrivalHub && nDays >= arrivalHub.minDays && nDays <= arrivalHub.maxDays) {
    return arrivalHub;
  }
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
  if (route.id === "th-phuket-andaman" || route.id === "th-krabi-andaman") return true;
  if (route.id === "th-chiangmai-north") return true;
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
    if (destCountry === "TH") return thDefaultRoute(nDays, keys, iata);
    if (destCountry === "VN" && !tripCountries.includes("KH")) {
      return vnDefaultRoute(nDays, keys);
    }
    if (destCountry === "PH") return phDefaultRoute(nDays, keys);
    if (destCountry === "ID") return idDefaultRoute(nDays, keys, w);
    if (destCountry === "BW") return BW_CLASSIC_DELTA_CHOBE;
    if (destCountry === "NA") return NA_CLASSIC_LOOP;
    if (destCountry === "ZA") {
      if (iata === "CPT") return ZA_CPT_GARDEN;
      return nDays >= 14 ? ZA_JNB_KRUGER_CAPE : ZA_JNB_KRUGER;
    }
    if (destCountry === "KE") return KE_CLASSIC_MARA;
    return null;
  }

  const eligible = candidates.filter((r) =>
    isRouteEligible(r, w, keys, tripCountries, nDays),
  );

  const scored = (eligible.length ? eligible : candidates)
    .map((r) => {
      let score = r.priority;
      if (r.wishTest?.test(w)) score += 50;
      if (r.hubIata === iata) score += 40;
      // Landing at Phuket/CNX must not pick Bangkok-first graphs.
      if (
        (iata === "HKT" || iata === "KBV" || iata === "CNX") &&
        r.hubIata === "BKK"
      ) {
        score -= 60;
      }
      if (r.interests?.some((i) => keys.includes(i))) score += 5;
      return { route: r, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.route ?? null;
  const arrivalHub = TH_ARRIVAL_HUB_ROUTES[iata];
  if (
    arrivalHub &&
    nDays >= arrivalHub.minDays &&
    nDays <= arrivalHub.maxDays &&
    (!best || best.hubIata === "BKK")
  ) {
    return arrivalHub;
  }
  return best;
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
      "curatedRoute je PREDLOG poti (vse destinacije), ne ukaz. Smeš dodati ali izpustiti bazo, če koledar in enosmerni lok držita. Prevozne noge so dejstva (otok brez piste). Izhodišče (LJU/MXP/…) je izven grafa. Uporabnikov razpored mest/noči premaga ta predlog.",
    regionBlueprint: templateToBlueprintBlocks(route.segments, nDays),
  };
}

export type RegionBlueprintBlock = { city: string; startDay: number; endDay: number };

/** International hubs: arrival/return buffers — do not absorb leftover trip days. */
const BLUEPRINT_HUB_CITY_RE =
  /^(manila|bangkok|jakarta|singapore|kuala lumpur|ho chi minh city|hanoi|tokyo|seoul|dubai|istanbul|gaborone|windhoek|johannesburg|nairobi)$/i;

function isBlueprintReturnHub(
  index: number,
  city: string,
  template: Array<[string, number]>,
): boolean {
  if (index !== template.length - 1) return false;
  const first = (template[0]?.[0] ?? "").trim();
  const c = city.trim();
  if (first && c.localeCompare(first, undefined, { sensitivity: "base" }) === 0) return true;
  return BLUEPRINT_HUB_CITY_RE.test(c);
}

function isBlueprintArrivalHub(
  index: number,
  city: string,
  templateDays: number,
): boolean {
  if (index !== 0) return false;
  // 3+ days in the template is a real opening stay (Bangkok 3), not a thin hub buffer.
  if (templateDays > 2) return false;
  if (templateDays > 0 && templateDays <= 2) return true;
  return BLUEPRINT_HUB_CITY_RE.test(city.trim());
}

/**
 * Scale agency segment template to total trip days.
 * Surplus days go to flex (0) / middle destinations — never dump onto final return hub
 * (e.g. Manila / Bangkok buffer).
 */
export function templateToBlueprintBlocks(
  template: Array<[string, number]>,
  nDays: number,
): RegionBlueprintBlock[] {
  if (!template.length || nDays < 1) return [];

  const fitted = dropUnreachableLongAccessStays(template, nDays);
  return assignBlueprintBlocks(fitted, nDays);
}

/** Skip a 6–8h island hop when the calendar cannot hold its minimum nights. */
function dropUnreachableLongAccessStays(
  template: Array<[string, number]>,
  nDays: number,
): Array<[string, number]> {
  let next = template;
  for (let guard = 0; guard < template.length; guard++) {
    const floors = next.map(([city, days], i) =>
      blueprintFloor(city, days, i, next),
    );
    if (floors.reduce((sum, n) => sum + n, 0) <= nDays) return next;
    const drop = [...next.keys()]
      .reverse()
      .find((i) => minStayNights(next[i]![0]) >= 4);
    if (drop == null) return next;
    next = next.filter((_, i) => i !== drop);
  }
  return next;
}

function blueprintFloor(
  city: string,
  days: number,
  index: number,
  template: Array<[string, number]>,
): number {
  const nextCity = template[index + 1]?.[0];
  const minN = minStayNights(city, nextCity);
  if (isBlueprintReturnHub(index, city, template)) {
    return Math.min(Math.max(1, days || 1), 3);
  }
  if (isBlueprintArrivalHub(index, city, days)) {
    return Math.max(minN, Math.min(Math.max(1, days || 1), 2));
  }
  if (days === 0) return Math.max(1, minN);
  return Math.max(1, minN, days);
}

function assignBlueprintBlocks(
  template: Array<[string, number]>,
  nDays: number,
): RegionBlueprintBlock[] {
  if (!template.length || nDays < 1) return [];

  const meta = template.map(([city, days], i) => {
    const returnHub = isBlueprintReturnHub(i, city, template);
    const arrivalHub = isBlueprintArrivalHub(i, city, days);
    const flex = days === 0;
    return {
      city,
      templateDays: days,
      flex,
      returnHub,
      arrivalHub,
      /** Expandable: islands / middle bases — not hub buffers or a fixed opening stay. */
      expandable: flex || (!returnHub && !arrivalHub && i !== 0),
    };
  });

  const assigned = meta.map((m, i) =>
    blueprintFloor(m.city, m.templateDays, i, template),
  );
  const floorOf = (i: number) =>
    blueprintFloor(meta[i]!.city, meta[i]!.templateDays, i, template);

  let remaining = nDays - assigned.reduce((sum, d) => sum + d, 0);

  const expandableIdx = meta
    .map((m, i) => (m.expandable ? i : -1))
    .filter((i) => i >= 0);
  const shrinkIdx = expandableIdx.length
    ? expandableIdx
    : meta.map((_, i) => i).filter((i) => !meta[i]!.returnHub);

  while (remaining < 0) {
    let shrunk = false;
    for (let i = shrinkIdx.length - 1; i >= 0 && remaining < 0; i--) {
      const idx = shrinkIdx[i]!;
      if (assigned[idx]! > floorOf(idx)) {
        assigned[idx]!--;
        remaining++;
        shrunk = true;
      }
    }
    if (!shrunk) {
      for (let i = assigned.length - 1; i >= 0 && remaining < 0; i--) {
        if (assigned[i]! > floorOf(i)) {
          assigned[i]!--;
          remaining++;
          shrunk = true;
        }
      }
    }
    if (!shrunk) break;
  }

  const growIdx =
    expandableIdx.length > 0
      ? expandableIdx
      : meta.map((_, i) => i).filter((i) => !meta[i]!.returnHub);
  let t = 0;
  while (remaining > 0 && growIdx.length > 0) {
    const idx = growIdx[t % growIdx.length]!;
    assigned[idx]!++;
    remaining--;
    t++;
  }
  if (remaining > 0) {
    const mid = Math.max(0, Math.floor((assigned.length - 1) / 2));
    assigned[mid]! += remaining;
  }

  let day = 1;
  const blocks: RegionBlueprintBlock[] = [];
  for (let i = 0; i < assigned.length; i++) {
    if (day > nDays) break;
    const span = Math.max(1, assigned[i]!);
    const endDay = Math.min(nDays, day + span - 1);
    blocks.push({ city: meta[i]!.city, startDay: day, endDay });
    day = endDay + 1;
  }

  // Undershoot safety: extend last expandable base, never a return hub dump.
  if (blocks.length && blocks[blocks.length - 1]!.endDay < nDays) {
    const gap = nDays - blocks[blocks.length - 1]!.endDay;
    let extendIdx = -1;
    for (let i = blocks.length - 1; i >= 0; i--) {
      if (meta[i]!.expandable) {
        extendIdx = i;
        break;
      }
    }
    if (extendIdx < 0) extendIdx = Math.max(0, blocks.length - 2);
    if (extendIdx < 0) extendIdx = 0;
    blocks[extendIdx]!.endDay += gap;
    for (let i = extendIdx + 1; i < blocks.length; i++) {
      blocks[i]!.startDay += gap;
      blocks[i]!.endDay += gap;
    }
    const last = blocks[blocks.length - 1]!;
    if (last.endDay > nDays) {
      const over = last.endDay - nDays;
      last.endDay = nDays;
      last.startDay = Math.max(1, last.startDay - over);
    }
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
  /** When true, skip curated graphs — user already spelled day/city allocation. */
  skipForUserStayPlan?: boolean;
}): string | undefined {
  if (opts.skipForUserStayPlan) return undefined;

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

  const arrivalCity = lookupDestination(opts.destinationIata)?.name;
  const arrivalLock = arrivalCity
    ? `
PRIHODOVNO LETALIŠČE (PREDNOST PRED BLUEPRINTOM):
- Mednarodni let pristane na ${opts.destinationIata} (${arrivalCity}).
- Prva destinacijska baza MORA biti ${arrivalCity} (dan prihoda po IZBRANEM LETU — lahko dan 1 ali kasneje, če let pristane +1d). Prepovedano: notranji let STRAN z ${opts.destinationIata} na dan prihoda (npr. HKT→BKK, CNX→BKK).
- Če bi blueprint predlagal drugo začetno mesto, začni v ${arrivalCity} in prilagodi vrstni red.
- Ta blok NE premaga uporabnikovega razporeda mest/noči, če je podan v željah.`
    : "";

  return `
=== PREDLOG POTI (ni ukaz — smeš dodati/izpustiti bazo) ===
${meta.steer}
${arrivalLock}

regionBlueprint — predlagane baze za ${opts.nDays} dni (ne zaklepaj, razen če je uporabnik sam napisal razpored):
${blueprintLines}

mustIncludeHighlights (vključi kot realne POI samo če je baza na poti):
${meta.mustIncludeHighlights.map((h) => `- ${h}`).join("\n")}

Pravila predloga:
- Enosmerna pot, brez teleporta. Če koledar drži, raje NOVA baza kot 5. noč v istem letovišču.
- Med fazami obvezno transportation[] (let/trajekt/vlak/kombi) na danu premika.
- Hub na začetku/koncu samo če je to prihod/odhod mednarodnega leta — ne izmišljuj notranjega leta na hub.
- Hub buffer: prihod max 1–2 dni, odhod max 2–3 dni. 5+ dni na hubu = napačno; presežek gre na novo bazo, ne na isti hub.
- Število dni prilagodi na ${opts.nDays}; vrstni red smeš razširiti z bazo na isti smeri.
${stayFactsPromptBlock(true)}
===`;
}
