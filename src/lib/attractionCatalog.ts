/**
 * Curated attraction menu — user picks, system schedules.
 * Phase 1: Thailand (BKK hub routes).
 */

import { lookupDestination } from "@/lib/destinationCoords";
import { resolveInterestBlueprint } from "@/lib/interestAnchors";
import type { PlannerInterestKey } from "@/lib/plannerInterests";
import { resolveCuratedBlueprint } from "@/lib/curatedRoutes";
import type { RegionBlueprintBlock } from "@/lib/multiCountryRoutes";

export type CatalogAttraction = {
  id: string;
  city: string;
  country: string;
  nameSl: string;
  nameEn: string;
  descriptionSl: string;
  descriptionEn: string;
  /** Minutes on site (excl. transfer). */
  durationMin: number;
  priceEurMin: number;
  priceEurMax: number;
  /** Blocks the whole calendar day when scheduled. */
  fullDay?: boolean;
  lat: number;
  lng: number;
  recommended?: boolean;
};

function a(
  id: string,
  city: string,
  opts: Omit<CatalogAttraction, "id" | "city" | "country"> & { country?: string },
): CatalogAttraction {
  return { id, city, country: opts.country ?? "TH", ...opts };
}

/** Thailand — per-city attraction menu. */
export const THAILAND_ATTRACTIONS: CatalogAttraction[] = [
  // Bangkok
  a("th-bkk-grand-palace", "Bangkok", {
    nameSl: "Grand Palace / Wat Phra Kaew",
    nameEn: "Grand Palace / Wat Phra Kaew",
    descriptionSl: "Kraljeva palača in smaragdni Buda — ikona Bangkoka. Zjutraj ob 8:30–11:00, zapre ~15:30.",
    descriptionEn: "Royal palace and Emerald Buddha — Bangkok icon. Go 8:30–11:00, closes ~15:30.",
    durationMin: 150,
    priceEurMin: 15,
    priceEurMax: 15,
    lat: 13.75,
    lng: 100.49,
    recommended: true,
  }),
  a("th-bkk-wat-pho", "Bangkok", {
    nameSl: "Wat Pho (Ležeči Buda)",
    nameEn: "Wat Pho (Reclining Buddha)",
    descriptionSl: "Ležeči Buda in tradicionalna masažna šola — takoj po Grand Palace.",
    descriptionEn: "Reclining Buddha and massage school — right after Grand Palace.",
    durationMin: 90,
    priceEurMin: 5,
    priceEurMax: 5,
    lat: 13.75,
    lng: 100.49,
    recommended: true,
  }),
  a("th-bkk-wat-arun", "Bangkok", {
    nameSl: "Wat Arun (sončni zahod)",
    nameEn: "Wat Arun (sunset)",
    descriptionSl: "Tempelj ob sončnem zahodu — 5 THB trajekt čez reko iz Wat Pho.",
    descriptionEn: "Temple at sunset — ferry from Wat Pho pier.",
    durationMin: 75,
    priceEurMin: 3,
    priceEurMax: 3,
    lat: 13.74,
    lng: 100.49,
    recommended: true,
  }),
  a("th-bkk-jim-thompson", "Bangkok", {
    nameSl: "Jim Thompson House",
    nameEn: "Jim Thompson House",
    descriptionSl: "Tradicionalna tajska hiša in muzej svile — mirno dopoldne.",
    descriptionEn: "Traditional Thai house and silk museum — quiet morning visit.",
    durationMin: 90,
    priceEurMin: 5,
    priceEurMax: 5,
    lat: 13.75,
    lng: 100.53,
  }),
  a("th-bkk-chinatown", "Bangkok", {
    nameSl: "Chinatown (Yaowarat) — večer",
    nameEn: "Chinatown (Yaowarat) evening",
    descriptionSl: "Ulična hrana, neon in dim — najbolj živahno 18:00–22:00.",
    descriptionEn: "Street food and neon — liveliest 6–10 pm.",
    durationMin: 120,
    priceEurMin: 8,
    priceEurMax: 20,
    lat: 13.74,
    lng: 100.51,
    recommended: true,
  }),
  a("th-bkk-asiatique", "Bangkok", {
    nameSl: "Asiatique / večer ob Chao Phraya",
    nameEn: "Asiatique riverside evening",
    descriptionSl: "Večernja tržnica ob reki — hrana, rokodelstvo, odpre ~16:00.",
    descriptionEn: "Riverside night market — food and crafts from ~4 pm.",
    durationMin: 150,
    priceEurMin: 10,
    priceEurMax: 25,
    lat: 13.72,
    lng: 100.51,
  }),
  a("th-bkk-lumphini", "Bangkok", {
    nameSl: "Lumphini Park",
    nameEn: "Lumphini Park",
    descriptionSl: "Zelena oaza v centru — sprehod ali piknik, popoldne.",
    descriptionEn: "Green oasis downtown — stroll or picnic, afternoon.",
    durationMin: 60,
    priceEurMin: 0,
    priceEurMax: 0,
    lat: 13.73,
    lng: 100.54,
  }),
  // Ayutthaya
  a("th-aya-mahathat", "Ayutthaya", {
    nameSl: "Wat Mahathat",
    nameEn: "Wat Mahathat",
    descriptionSl: "Budova glava v koreninah drevesa — simbol Ayutthaye.",
    descriptionEn: "Buddha head in tree roots — symbol of Ayutthaya.",
    durationMin: 60,
    priceEurMin: 2,
    priceEurMax: 2,
    lat: 14.35,
    lng: 100.57,
    recommended: true,
  }),
  a("th-aya-park", "Ayutthaya", {
    nameSl: "Zgodovinski park Ayutthaya",
    nameEn: "Ayutthaya Historical Park",
    descriptionSl: "UNESCO ruševine — najem kolesa priporočljiv.",
    descriptionEn: "UNESCO ruins — bike rental recommended.",
    durationMin: 180,
    priceEurMin: 5,
    priceEurMax: 10,
    lat: 14.35,
    lng: 100.57,
    recommended: true,
  }),
  a("th-aya-ratchaburana", "Ayutthaya", {
    nameSl: "Wat Ratchaburana",
    nameEn: "Wat Ratchaburana",
    descriptionSl: "Freske in stolpi — zgodaj zjutraj, manj gneče.",
    descriptionEn: "Frescos and prang — early morning, fewer crowds.",
    durationMin: 60,
    priceEurMin: 2,
    priceEurMax: 2,
    lat: 14.35,
    lng: 100.57,
  }),
  // Chiang Mai
  a("th-cnx-doi-suthep", "Chiang Mai", {
    nameSl: "Doi Suthep",
    nameEn: "Doi Suthep",
    descriptionSl: "Sveti tempelj na hribu z razgledom — pol dneva, zjutraj.",
    descriptionEn: "Hill temple with city views — half day, morning.",
    durationMin: 180,
    priceEurMin: 3,
    priceEurMax: 8,
    lat: 18.8,
    lng: 98.92,
    recommended: true,
  }),
  a("th-cnx-old-city", "Chiang Mai", {
    nameSl: "Staro mesto — templji",
    nameEn: "Old City temples",
    descriptionSl: "Wat Chedi Luang, Wat Phra Singh — kolesarjenje ali tuk-tuk.",
    descriptionEn: "Wat Chedi Luang, Wat Phra Singh — bike or tuk-tuk.",
    durationMin: 150,
    priceEurMin: 0,
    priceEurMax: 5,
    lat: 18.79,
    lng: 98.99,
    recommended: true,
  }),
  a("th-cnx-elephant", "Chiang Mai", {
    nameSl: "Elephant Nature Park",
    nameEn: "Elephant Nature Park",
    descriptionSl: "Etična zavetišče slonov — celodnevni izlet (rezervacija vnaprej).",
    descriptionEn: "Ethical elephant sanctuary — full-day trip (book ahead).",
    durationMin: 480,
    priceEurMin: 55,
    priceEurMax: 75,
    fullDay: true,
    lat: 19.22,
    lng: 98.92,
  }),
  a("th-cnx-night-bazaar", "Chiang Mai", {
    nameSl: "Night Bazaar",
    nameEn: "Night Bazaar",
    descriptionSl: "Nočni trg — hrana, rokodelstvo, sproščena atmosfera.",
    descriptionEn: "Night market — food, crafts, relaxed vibe.",
    durationMin: 120,
    priceEurMin: 8,
    priceEurMax: 20,
    lat: 18.78,
    lng: 98.99,
  }),
  // Krabi
  a("th-kbv-railay", "Krabi", {
    nameSl: "Railay Beach",
    nameEn: "Railay Beach",
    descriptionSl: "Apneji in plaže — čoln iz Ao Nang, pol dneva.",
    descriptionEn: "Cliffs and beaches — boat from Ao Nang, half day.",
    durationMin: 240,
    priceEurMin: 5,
    priceEurMax: 15,
    lat: 8.01,
    lng: 98.84,
    recommended: true,
  }),
  a("th-kbv-phi-phi", "Krabi", {
    nameSl: "Koh Phi Phi / Maya Bay",
    nameEn: "Koh Phi Phi / Maya Bay",
    descriptionSl: "Celodnevni izlet z ladjo — Maya Bay, snorkljanje (sezonsko odprto).",
    descriptionEn: "Full-day boat trip — Maya Bay, snorkeling (seasonal access).",
    durationMin: 480,
    priceEurMin: 35,
    priceEurMax: 55,
    fullDay: true,
    lat: 7.74,
    lng: 98.77,
    recommended: true,
  }),
  a("th-kbv-emerald", "Krabi", {
    nameSl: "Emerald Pool & Hot Springs",
    nameEn: "Emerald Pool & Hot Springs",
    descriptionSl: "Naravni bazen in vroči vrelci v džungli — zjutraj.",
    descriptionEn: "Jungle pool and hot springs — go early.",
    durationMin: 240,
    priceEurMin: 10,
    priceEurMax: 18,
    lat: 7.92,
    lng: 99.25,
    recommended: true,
  }),
  a("th-kbv-tiger-cave", "Krabi", {
    nameSl: "Tiger Cave Temple",
    nameEn: "Tiger Cave Temple",
    descriptionSl: "1237 stopnic do razgleda — zgodaj zjutraj, ločen dan od Emerald Pool.",
    descriptionEn: "1237 steps to viewpoint — early morning, separate day from Emerald Pool.",
    durationMin: 180,
    priceEurMin: 0,
    priceEurMax: 0,
    lat: 8.12,
    lng: 98.92,
  }),
  a("th-kbv-ao-nang", "Krabi", {
    nameSl: "Ao Nang Beach & Night Market",
    nameEn: "Ao Nang Beach & Night Market",
    descriptionSl: "Plaža, restavracije in večernji trg ob morju.",
    descriptionEn: "Beach, restaurants and evening market by the sea.",
    durationMin: 180,
    priceEurMin: 5,
    priceEurMax: 25,
    lat: 8.04,
    lng: 98.82,
  }),
  // Koh Lipe
  a("th-lipe-sunrise", "Koh Lipe", {
    nameSl: "Sunrise Beach",
    nameEn: "Sunrise Beach",
    descriptionSl: "Snorkljanje in sončenje na vzhodni plaži.",
    descriptionEn: "Snorkeling and sun on the east beach.",
    durationMin: 180,
    priceEurMin: 0,
    priceEurMax: 0,
    lat: 6.49,
    lng: 99.3,
    recommended: true,
  }),
  a("th-lipe-pattaya", "Koh Lipe", {
    nameSl: "Pattaya Beach & Walking Street",
    nameEn: "Pattaya Beach & Walking Street",
    descriptionSl: "Glavna plaža in večerna hrana — morski sadeži.",
    descriptionEn: "Main beach and evening food — seafood on Walking Street.",
    durationMin: 180,
    priceEurMin: 10,
    priceEurMax: 30,
    lat: 6.49,
    lng: 99.3,
    recommended: true,
  }),
  a("th-lipe-snorkel", "Koh Lipe", {
    nameSl: "Snorkljanje / izlet Koh Adang",
    nameEn: "Snorkeling / Koh Adang trip",
    descriptionSl: "Longtail čoln do naravnega rezervata — pol dneva.",
    descriptionEn: "Longtail to marine park — half day.",
    durationMin: 240,
    priceEurMin: 20,
    priceEurMax: 45,
    lat: 6.52,
    lng: 99.35,
  }),
  a("th-lipe-kayak", "Koh Lipe", {
    nameSl: "Kayak ob obali",
    nameEn: "Coastal kayaking",
    descriptionSl: "Najem kajaka ob Sunrise Beach — lasten tempo.",
    descriptionEn: "Kayak rental at Sunrise Beach — your own pace.",
    durationMin: 120,
    priceEurMin: 10,
    priceEurMax: 20,
    lat: 6.49,
    lng: 99.3,
  }),
];

const BY_ID = new Map(THAILAND_ATTRACTIONS.map((x) => [x.id, x]));

const CITY_TIPS: Record<string, { localSl: string; localEn: string; travelSl: string; travelEn: string }> = {
  Bangkok: {
    localSl: "BTS / MRT za center, Grab za letališče.",
    localEn: "BTS/MRT downtown, Grab to airport.",
    travelSl: "Lahka oblačila, pogajanje na tržnicah.",
    travelEn: "Light clothes, bargain at markets.",
  },
  Ayutthaya: {
    localSl: "Kolo ali tuk-tuk med templji.",
    localEn: "Bike or tuk-tuk between temples.",
    travelSl: "Voda in kapa — malo senč.",
    travelEn: "Water and hat — little shade.",
  },
  "Chiang Mai": {
    localSl: "Songthaew za kratke vožnje.",
    localEn: "Songthaew for short rides.",
    travelSl: "Zjutraj v hribe, popoldne notranji program.",
    travelEn: "Hills in morning, indoor backup afternoon.",
  },
  Krabi: {
    localSl: "Skuter ali čoln do Railay.",
    localEn: "Scooter or boat to Railay.",
    travelSl: "Monsun: preveri urnike čolnov.",
    travelEn: "Monsoon: check boat schedules.",
  },
  "Koh Lipe": {
    localSl: "Otok peš — brez avtomobilov.",
    localEn: "Walk the island — no cars.",
    travelSl: "Rezervni dan na kopnem ob slabem vremenu.",
    travelEn: "Land backup day if seas are rough.",
  },
};

export const MIN_CATALOG_PICKS = 3;

export function catalogSupportedForIata(iata: string): boolean {
  const country = lookupDestination(iata)?.country;
  return country === "TH";
}

export function getAttractionById(id: string): CatalogAttraction | undefined {
  return BY_ID.get(id);
}

export function getCatalogForCities(cities: string[], country = "TH"): CatalogAttraction[] {
  const norm = new Set(cities.map((c) => c.toLowerCase()));
  const pool = country === "TH" ? THAILAND_ATTRACTIONS : [];
  return pool.filter((a) => norm.has(a.city.toLowerCase()));
}

export function defaultPicksForCities(cities: string[]): string[] {
  return getCatalogForCities(cities)
    .filter((a) => a.recommended)
    .map((a) => a.id);
}

function templateToBlueprintBlocks(
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
  if (last && last.endDay !== nDays) last.endDay = nDays;
  return blocks;
}

/** Cities on the trip route — for the picker UI (client-safe). */
export function resolvePickerBlueprint(opts: {
  nDays: number;
  destinationIata: string;
  priorities?: PlannerInterestKey[];
  wishes?: string;
  returnFromIata?: string;
}): RegionBlueprintBlock[] | undefined {
  const curated = resolveCuratedBlueprint(
    opts.nDays,
    opts.destinationIata,
    templateToBlueprintBlocks,
    opts.priorities,
    opts.wishes,
    opts.returnFromIata,
  );
  if (curated?.length) return curated;

  const interest = resolveInterestBlueprint(
    opts.nDays,
    opts.destinationIata,
    opts.priorities,
    templateToBlueprintBlocks,
  );
  if (interest?.length) return interest;

  const hub = lookupDestination(opts.destinationIata);
  if (hub) {
    return [{ city: hub.name, startDay: 1, endDay: opts.nDays }];
  }
  return undefined;
}

export function cityTips(city: string, lang: string): { local: string; travel: string } {
  const tips = CITY_TIPS[city];
  const slo = lang === "sl" || lang.startsWith("sl");
  if (!tips) {
    return {
      local: slo ? "Grab / lokalni taxi." : "Grab / local taxi.",
      travel: slo ? "Pij veliko vode." : "Drink plenty of water.",
    };
  }
  return {
    local: slo ? tips.localSl : tips.localEn,
    travel: slo ? tips.travelSl : tips.travelEn,
  };
}

export function formatDuration(min: number, lang: string): string {
  const slo = lang === "sl" || lang.startsWith("sl");
  if (min >= 480) return slo ? "cel dan" : "full day";
  if (min >= 180) return slo ? `~${Math.round(min / 60)} h` : `~${Math.round(min / 60)}h`;
  if (min >= 60) return slo ? `~${Math.round(min / 60)} h` : `~${Math.round(min / 60)}h`;
  return slo ? `${min} min` : `${min} min`;
}

export function formatPriceRange(min: number, max: number, lang: string): string {
  const slo = lang === "sl" || lang.startsWith("sl");
  if (min === 0 && max === 0) return slo ? "brezplačno" : "free";
  if (min === max) return `€${min}`;
  return `€${min}–${max}`;
}

export type CatalogBudgetEstimate = {
  perPersonMin: number;
  perPersonMax: number;
  groupMin: number;
  groupMax: number;
  pickCount: number;
};

export function estimateCatalogBudget(ids: string[], pax: number): CatalogBudgetEstimate {
  let min = 0;
  let max = 0;
  for (const id of ids) {
    const a = BY_ID.get(id);
    if (!a) continue;
    min += a.priceEurMin;
    max += a.priceEurMax;
  }
  const people = Math.max(1, pax);
  return {
    perPersonMin: min,
    perPersonMax: max,
    groupMin: min * people,
    groupMax: max * people,
    pickCount: ids.length,
  };
}

export function catalogAttractionLabel(a: CatalogAttraction, lang: string): string {
  const slo = lang === "sl" || lang.startsWith("sl");
  return slo ? a.nameSl : a.nameEn;
}

export function catalogAttractionDescription(a: CatalogAttraction, lang: string): string {
  const slo = lang === "sl" || lang.startsWith("sl");
  return slo ? a.descriptionSl : a.descriptionEn;
}
