import { lookupDestination } from "@/lib/destinationCoords";
import { getInterestAnchor } from "@/lib/interestAnchors";
import type { PlannerInterestKey } from "@/lib/plannerInterests";
import { parsePlannerInterestKeys } from "@/lib/plannerInterests";

type HintText = { sl: string; en: string };

type CountryHint = HintText & {
  countries: string[];
  months: number[];
  /** Mutually exclusive bucket — only the best-matching hint per group is kept. */
  group?: string;
};

type RegionHint = HintText & {
  id: string;
  countries: string[];
  cityTest: RegExp;
  months: number[];
};

/** Month-specific climate / season notes (1 = January). */
const COUNTRY_HINTS: CountryHint[] = [
  {
    countries: ["PH"],
    months: [6, 7, 8, 9, 10, 11],
    group: "PH-season",
    sl: "Na Filipinih je običajno obdobje monsunskih dežjev — pogoste popoldanske plohe in višja vlažnost.",
    en: "Philippines wet/monsoon season — frequent afternoon showers and high humidity.",
  },
  {
    countries: ["PH"],
    months: [12, 1, 2, 3, 4, 5],
    group: "PH-season",
    sl: "Sušna sezona na Filipinih — manj dežja, primerno za otoke in potapljanje.",
    en: "Philippines dry season — less rain, good for islands and diving.",
  },
  {
    countries: ["AU"],
    months: [12, 1, 2],
    sl: "Poletje na južni polobli — v Avstraliji je toplo do vroče; v Evropi je zima.",
    en: "Southern hemisphere summer — hot in Australia while Europe is in winter.",
  },
  {
    countries: ["AU"],
    months: [6, 7, 8],
    sl: "Zima na južni polobli — v Avstraliji je hladneje; v Evropi je poletje.",
    en: "Southern hemisphere winter — cooler in Australia while Europe has summer.",
  },
  {
    countries: ["TH"],
    months: [5, 6, 7, 8, 9],
    group: "TH-season",
    sl: "Deževna sezona na Tajskem — krajši popoldanski rokopi, še vedno potovalno, manj turistov.",
    en: "Thailand rainy season — short afternoon downpours, still travelable, fewer crowds.",
  },
  {
    countries: ["TH"],
    months: [10],
    group: "TH-season",
    sl: "Oktober na Tajskem — konec monsunov, dež se hitro manjša; od sredine meseca naprej vse bolj suho.",
    en: "October in Thailand — monsoon tailing off, rain decreases; drier from mid-month onward.",
  },
  {
    countries: ["TH"],
    months: [11, 12, 1, 2, 3],
    group: "TH-season",
    sl: "Sušna / hladnejša sezona na Tajskem — prijetno vreme, vrhunec sezone na plažah.",
    en: "Thailand cool/dry season — pleasant weather, peak beach season.",
  },
  {
    countries: ["ID"],
    months: [10, 11, 12, 1, 2, 3, 4],
    sl: "Deževna sezona na Indoneziji (vkl. Bali) — več dežja, vreme hitro spreminljivo.",
    en: "Indonesia wet season (incl. Bali) — more rain, quickly changing weather.",
  },
  {
    countries: ["VN"],
    months: [9, 10, 11, 12, 1, 2],
    sl: "Severni Vietnam in Hanoi — hladnejše in megleno; jug je še vedno topel.",
    en: "North Vietnam/Hanoi — cooler and misty; south stays warm.",
  },
  {
    countries: ["JP"],
    months: [6, 7],
    sl: "Japonska — sezona dežja (tsuyu), vlažno in toplo.",
    en: "Japan rainy season (tsuyu) — humid and warm.",
  },
  {
    countries: ["JP"],
    months: [3, 4],
    sl: "Japonska — sezona cvetenja češnje (sakura), zelo priljubljeno in gneča.",
    en: "Japan cherry blossom season — popular and crowded.",
  },
  {
    countries: ["GR", "ES", "IT", "PT", "HR"],
    months: [7, 8],
    sl: "Vroče mediteransko poletje — visoke temperature, po možnosti načrtuj sence in zgodnje ure.",
    en: "Hot Mediterranean summer — high heat; plan shade and early starts.",
  },
  {
    countries: ["AE"],
    months: [6, 7, 8, 9],
    sl: "Poletje v ZAE — ekstremna vročina (40 °C+), večina aktivnosti zvečer ali v klimatiziranih prostorih.",
    en: "UAE summer — extreme heat (40 °C+), plan evening or indoor activities.",
  },
  {
    countries: ["AE"],
    months: [11, 12, 1, 2, 3],
    sl: "Zima v ZAE — prijetno toplo, idealna sezona za obisk.",
    en: "UAE winter — pleasantly warm, ideal visiting season.",
  },
  {
    countries: ["BR", "AR"],
    months: [12, 1, 2],
    sl: "Poletje na južni polobli — toplo do vroče v Južni Ameriki.",
    en: "Southern hemisphere summer — warm to hot in South America.",
  },
];

/** Phase 2 — sub-national climate (north vs coast, monsoon side, etc.). */
const REGION_HINTS: RegionHint[] = [
  {
    id: "th-north-rain",
    countries: ["TH"],
    cityTest: /chiang mai|chiang rai|pai|mae hong son|doi suthep|doi inthanon|severni tajsk/i,
    months: [6, 7, 8, 9, 10],
    sl: "Severni Tajska (Chiang Mai) v deževni sezoni — popoldanske plohe, megla v gorah; pohode in Doi Suthep/Doi Inthanon načrtuj zjutraj, rezervni indoor program popoldne.",
    en: "Northern Thailand (Chiang Mai) in rainy season — afternoon showers, hill fog; schedule hikes and Doi Suthep/Doi Inthanon mornings, indoor backup afternoons.",
  },
  {
    id: "th-andaman-monso",
    countries: ["TH"],
    cityTest: /phuket|krabi|koh lipe|koh lanta|phi phi|railay|ao nang|andaman|satun|patong|kata/i,
    months: [5, 6, 7, 8, 9, 10],
    sl: "Andamanska obala — SW monsun: valovi, občasno odpadejo čolni/feriji, slabša vidnost pri snorkljanju; imej rezervni dan na kopnem.",
    en: "Andaman coast — SW monsoon: rough seas, occasional boat/ferry cancellations, poorer snorkel visibility; keep a land backup day.",
  },
  {
    id: "th-gulf-rain",
    countries: ["TH"],
    cityTest: /koh samui|samui|koh phangan|phangan|koh tao|ko chang|koh chang|gulf|surat thani/i,
    months: [10, 11, 12, 1],
    sl: "Tajski zaliv (Samui, Phangan, Ko Chang) — v tem obdobju pogosteje dež kot na Andamanski strani; preveri ferije pred odhodom.",
    en: "Thai Gulf (Samui, Phangan, Ko Chang) — often wetter than the Andaman side in this period; check ferries before travel.",
  },
  {
    id: "th-rainforest",
    countries: ["TH"],
    cityTest: /khao sok|kao sok|erawan|huai kha khaeng|doi ang khang|national park|narodni park|deževn/i,
    months: [5, 6, 7, 8, 9, 10, 11],
    sl: "Deževni gozdovi / narodni parki — blatne steze, popoldanski dež, včasih zaprti slapovi; vodotesna obutev, zgodnji start, rezervni plan.",
    en: "Rainforest / national parks — muddy trails, afternoon rain, waterfalls sometimes closed; waterproof footwear, early starts, backup plan.",
  },
  {
    id: "vn-north-winter",
    countries: ["VN"],
    cityTest: /hanoi|sapa|ha long|halong|ninh binh|bac ha|severni vietnam/i,
    months: [11, 12, 1, 2],
    sl: "Severni Vietnam — hladno (15–20 °C), megla na Sapi in v Halongu; planiraj toplejše plasti in fleksibilne izlete z ladjo.",
    en: "North Vietnam — cool (15–20 °C), fog on Sapa and Ha Long; pack layers and flexible boat trips.",
  },
  {
    id: "vn-central-flood",
    countries: ["VN"],
    cityTest: /hue|hoi an|da nang|central vietnam|srednji vietnam/i,
    months: [9, 10, 11, 12],
    sl: "Srednji Vietnam (Hue, Hoi An) — vrhunec deževja in občasnih poplav; stare mestne ulice lahko poplavljene, imej rezervni dan.",
    en: "Central Vietnam (Hue, Hoi An) — peak rain and occasional flooding; old-town streets may flood, keep a backup day.",
  },
  {
    id: "vn-south-monso",
    countries: ["VN"],
    cityTest: /ho chi minh|saigon|mekong|phu quoc|mui ne|delta|južni vietnam/i,
    months: [5, 6, 7, 8, 9, 10, 11],
    sl: "Južni Vietnam — deževna sezona z kratkimi, močnimi plohami; Mekong in Phu Quoc izleti lahko prestavljeni.",
    en: "South Vietnam — rainy season with short heavy showers; Mekong and Phu Quoc trips may be rescheduled.",
  },
  {
    id: "id-bali-wet",
    countries: ["ID"],
    cityTest: /bali|ubud|uluwatu|nusa penida|seminyak|gili|lombok/i,
    months: [11, 12, 1, 2, 3],
    sl: "Bali / Nusa Penida — deževna sezona: hitre plohe, valovi na severnem obronku; izleti z ladjo zjutraj, ne popoldne.",
    en: "Bali / Nusa Penida — wet season: quick downpours, rough seas on north coast; boat trips in the morning, not afternoon.",
  },
  {
    id: "id-borneo-rain",
    countries: ["ID", "MY"],
    cityTest: /borneo|kalimantan|kuching|kinabalu|sabah|sarawak|semporna/i,
    months: [10, 11, 12, 1, 2, 3],
    sl: "Borneo / deževni gozd — najbolj deževno obdobje; orangutan in river safari izleti pogosto v dežju, planiraj več dni rezerve.",
    en: "Borneo / rainforest — wettest period; orangutan and river safari trips often run in rain, plan extra buffer days.",
  },
  {
    id: "ph-palawan-wet",
    countries: ["PH"],
    cityTest: /palawan|el nido|coron|puerto princesa|underground river/i,
    months: [6, 7, 8, 9, 10],
    sl: "Palawan (El Nido, Coron) v monsunu — valovi in odpovedi island-hopping; El Nido ture imej z rezervo.",
    en: "Palawan (El Nido, Coron) in monsoon — waves and island-hopping cancellations; keep El Nido tour backup days.",
  },
  {
    id: "my-cameron-rain",
    countries: ["MY"],
    cityTest: /cameron|genting|tea plantation|čajnic/i,
    months: [4, 5, 6, 7, 8, 9, 10, 11],
    sl: "Malajski hribi (Cameron Highlands) — pogost dež in megla; plantaže čaja pogosto v megli popoldne.",
    en: "Malaysian highlands (Cameron Highlands) — frequent rain and fog; tea plantations often misty afternoons.",
  },
  {
    id: "laos-rain",
    countries: ["LA"],
    cityTest: /luang prabang|vang vieng|pakse|4000 islands|laos/i,
    months: [5, 6, 7, 8, 9, 10],
    sl: "Laos — deževna sezona: slapovi močni, rečne aktivnosti včasih odpovedane; Mekong cruise preveri vremensko.",
    en: "Laos rainy season — waterfalls strong, river activities sometimes cancelled; check Mekong cruise weather.",
  },
  {
    id: "kh-rain",
    countries: ["KH"],
    cityTest: /siem reap|angkor|phnom penh|kampot|koh rong/i,
    months: [5, 6, 7, 8, 9, 10, 11],
    sl: "Kambodža — deževna sezona: Angkor zjutraj (manj vroče), popoldanske plohe; Koh Rong čolni občasno odpadejo.",
    en: "Cambodia rainy season — Angkor mornings (less heat), afternoon showers; Koh Rong boats occasionally cancelled.",
  },
];

const NATURE_INTERESTS = new Set<PlannerInterestKey>([
  "nature",
  "hikes",
  "mountains",
  "rivers",
]);

const RAINFOREST_INTEREST_HINT: HintText = {
  sl: "Izbrali ste naravo / pohode — v deževni sezoni so gozdne steze blatne, popoldanski dež skoraj dnevni; načrtuj zgodnje jutranje izlete in indoor rezervo.",
  en: "Nature / hikes selected — in rainy season forest trails are muddy and afternoon rain is common; plan early-morning outings and indoor backups.",
};

export type TripClimateOpts = {
  destinationIata: string;
  departDate: string;
  returnDate?: string;
  lang: string;
  priorities?: string[];
  wishes?: string;
  regionCities?: string[];
};

export type RegionClimateBlock = {
  city: string;
  hints: string[];
};

export type TripClimateResult = {
  tripClimate: string[];
  regionClimate: RegionClimateBlock[];
};

function useSl(lang: string): boolean {
  return lang.startsWith("sl");
}

function pickText(h: HintText, lang: string): string {
  return useSl(lang) ? h.sl : h.en;
}

/** Central Vietnam (Hoi An, Hue) — peak rain/flood months per vn-central-flood hint. */
export function isCentralVietnamFloodMonth(month: number): boolean {
  return month >= 9 && month <= 12;
}

export function isCentralVietnamCity(city: string): boolean {
  return /hue|hoi an|da nang|central vietnam|srednji vietnam/i.test(city.toLowerCase());
}

export function isCentralVietnamFloodDate(isoDate: string): boolean {
  const m = Number(isoDate.slice(5, 7));
  if (!Number.isFinite(m)) return false;
  return isCentralVietnamFloodMonth(m);
}

/** Calendar months touched by the trip (1–12). */
export function tripMonths(departDate: string, returnDate?: string): number[] {
  const start = Number(departDate.slice(5, 7));
  if (!Number.isFinite(start) || start < 1 || start > 12) return [];

  if (!returnDate || returnDate.length < 10) return [start];

  const end = Number(returnDate.slice(5, 7));
  if (!Number.isFinite(end) || end < 1 || end > 12) return [start];

  const months: number[] = [];
  let m = start;
  for (let guard = 0; guard < 14; guard++) {
    months.push(m);
    if (m === end) break;
    m = m === 12 ? 1 : m + 1;
  }
  return [...new Set(months)];
}

/** Calendar days per month (1–12) covered by the trip. */
export function tripDayCountByMonth(departDate: string, returnDate?: string): Map<number, number> {
  const start = new Date(`${departDate}T12:00:00`);
  const end = returnDate && returnDate.length >= 10 ? new Date(`${returnDate}T12:00:00`) : start;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    const m = Number(departDate.slice(5, 7));
    return Number.isFinite(m) ? new Map([[m, 1]]) : new Map();
  }

  const counts = new Map<number, number>();
  const cur = new Date(start);
  for (let guard = 0; guard < 400; guard++) {
    const m = cur.getMonth() + 1;
    counts.set(m, (counts.get(m) ?? 0) + 1);
    if (cur.toDateString() === end.toDateString()) break;
    cur.setDate(cur.getDate() + 1);
  }
  return counts;
}

function scoreHintMonths(hintMonths: number[], dayCounts: Map<number, number>): number {
  let score = 0;
  for (const [month, days] of dayCounts) {
    if (hintMonths.includes(month)) score += days;
  }
  return score;
}

function totalTripDays(dayCounts: Map<number, number>): number {
  let total = 0;
  for (const days of dayCounts.values()) total += days;
  return total;
}

function countryHints(
  country: string,
  dayCounts: Map<number, number>,
  returnMonth: number | null,
  lang: string,
): string[] {
  const candidates = COUNTRY_HINTS.filter((h) => h.countries.includes(country))
    .map((h) => ({ h, score: scoreHintMonths(h.months, dayCounts) }))
    .filter((c) => c.score > 0);

  const byGroup = new Map<string, typeof candidates>();
  const ungrouped: typeof candidates = [];

  for (const c of candidates) {
    if (c.h.group) {
      const list = byGroup.get(c.h.group) ?? [];
      list.push(c);
      byGroup.set(c.h.group, list);
    } else {
      ungrouped.push(c);
    }
  }

  const out: string[] = [];

  for (const group of byGroup.values()) {
    group.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aReturn = returnMonth != null && a.h.months.includes(returnMonth);
      const bReturn = returnMonth != null && b.h.months.includes(returnMonth);
      if (aReturn && !bReturn) return -1;
      if (bReturn && !aReturn) return 1;
      return 0;
    });
    out.push(pickText(group[0]!.h, lang));
  }

  for (const c of ungrouped) {
    out.push(pickText(c.h, lang));
  }

  return out;
}

function regionHintsForCity(
  city: string,
  country: string,
  months: number[],
  dayCounts: Map<number, number>,
  returnMonth: number | null,
  lang: string,
): string[] {
  const c = city.toLowerCase();
  const out: string[] = [];
  const totalDays = totalTripDays(dayCounts);

  for (const h of REGION_HINTS) {
    if (!h.countries.includes(country)) continue;
    if (!h.cityTest.test(c)) continue;
    if (!months.some((m) => h.months.includes(m))) continue;

    const score = scoreHintMonths(h.months, dayCounts);
    if (score <= 0) continue;

    const isWetHint = /rain|monso|wet|monsun|dežev/i.test(h.id);
    const endsInCoolDrySeason =
      returnMonth != null && (returnMonth >= 11 || returnMonth <= 3);
    if (
      isWetHint &&
      country === "TH" &&
      endsInCoolDrySeason &&
      totalDays > 0 &&
      score / totalDays < 0.6
    ) {
      continue;
    }

    out.push(pickText(h, lang));
  }
  return out;
}

/** Likely cities from interest anchors when blueprint not yet generated. */
export function inferLikelyRegionCities(
  destinationIata: string,
  priorities?: string[],
): string[] {
  const dest = lookupDestination(destinationIata);
  if (!dest) return [];

  const keys = parsePlannerInterestKeys(priorities ?? []);
  const cities = new Set<string>();

  for (const key of keys) {
    const anchor = getInterestAnchor(dest.country, key);
    if (!anchor) continue;
    for (const [city] of anchor.routeTemplate) cities.add(city);
  }

  if (dest.country === "TH" && cities.size === 0) {
    cities.add(dest.name);
  }

  return [...cities];
}

function wishesMentionRainforest(wishes?: string): boolean {
  const w = (wishes ?? "").toLowerCase();
  return /khao sok|deževn.*gozd|rainforest|jungle|trek|pohod|national park|narodni park|doi inthanon|borneo|kinabalu/i.test(
    w,
  );
}

function isRainyMonthForCountry(country: string, dayCounts: Map<number, number>): boolean {
  const rainyCountries: Record<string, number[]> = {
    TH: [5, 6, 7, 8, 9],
    VN: [5, 6, 7, 8, 9, 10, 11],
    PH: [6, 7, 8, 9, 10, 11],
    ID: [10, 11, 12, 1, 2, 3, 4],
    MY: [4, 5, 6, 7, 8, 9, 10, 11],
    LA: [5, 6, 7, 8, 9, 10],
    KH: [5, 6, 7, 8, 9, 10, 11],
  };
  const rainy = rainyCountries[country];
  if (!rainy) return false;
  const total = totalTripDays(dayCounts);
  if (total <= 0) return false;
  const rainyDays = scoreHintMonths(rainy, dayCounts);
  return rainyDays / total >= 0.5;
}

function natureInterestHint(
  country: string,
  dayCounts: Map<number, number>,
  priorities: string[] | undefined,
  wishes: string | undefined,
  lang: string,
): string | null {
  const keys = parsePlannerInterestKeys(priorities ?? []);
  const hasNatureInterest = keys.some((k) => NATURE_INTERESTS.has(k));
  const rainforestTrip =
    wishesMentionRainforest(wishes) ||
    keys.includes("nature") ||
    keys.includes("hikes") ||
    keys.includes("mountains");

  if (!rainforestTrip && !hasNatureInterest) return null;
  if (!isRainyMonthForCountry(country, dayCounts)) return null;

  if (wishesMentionRainforest(wishes)) {
    return pickText(RAINFOREST_INTEREST_HINT, lang);
  }
  if (hasNatureInterest) {
    return pickText(RAINFOREST_INTEREST_HINT, lang);
  }
  return null;
}

/** Phase 2 — country + regional + interest-aware climate payload. */
export function buildTripClimate(opts: TripClimateOpts): TripClimateResult {
  const dest = lookupDestination(opts.destinationIata);
  if (!dest) return { tripClimate: [], regionClimate: [] };

  const months = tripMonths(opts.departDate, opts.returnDate);
  if (months.length === 0) return { tripClimate: [], regionClimate: [] };

  const dayCounts = tripDayCountByMonth(opts.departDate, opts.returnDate);
  const returnMonth = opts.returnDate ? Number(opts.returnDate.slice(5, 7)) : null;

  const lang = opts.lang;
  const tripClimate: string[] = [...countryHints(dest.country, dayCounts, returnMonth, lang)];

  const hemisphereNote = hemisphereHints(dest, months, lang);
  tripClimate.push(...hemisphereNote);

  const natureHint = natureInterestHint(
    dest.country,
    dayCounts,
    opts.priorities,
    opts.wishes,
    lang,
  );
  if (natureHint) tripClimate.push(natureHint);

  const cities =
    opts.regionCities?.length
      ? opts.regionCities
      : inferLikelyRegionCities(opts.destinationIata, opts.priorities);

  const regionClimate: RegionClimateBlock[] = [];

  for (const city of cities) {
    const hints = regionHintsForCity(
      city,
      dest.country,
      months,
      dayCounts,
      returnMonth,
      lang,
    );
    if (hints.length === 0) continue;
    regionClimate.push({ city, hints: [...new Set(hints)] });
  }

  return {
    tripClimate: [...new Set(tripClimate)].slice(0, 5),
    regionClimate,
  };
}

function hemisphereHints(
  dest: { lat: number; country: string },
  months: number[],
  lang: string,
): string[] {
  const out: string[] = [];
  const useSl = lang.startsWith("sl");

  if (dest.lat < 0 && months.some((m) => m >= 6 && m <= 8)) {
    out.push(
      useSl
        ? "Destinacija je na južni polobli — v tem obdobju je tam zima (v Evropi poletje)."
        : "Southern hemisphere destination — winter there while Europe has summer.",
    );
  }
  if (dest.lat > 0 && months.some((m) => m >= 12 || m <= 2)) {
    if (dest.country !== "AE" && dest.lat < 35) {
      if (["TH", "PH", "ID", "VN", "MY", "SG", "MX", "BR"].includes(dest.country)) {
        out.push(
          useSl
            ? "Evropska zima — na destinaciji je običajno toplo in sončno."
            : "European winter — destination is typically warm and sunny.",
        );
      }
    }
  }
  return out;
}

/** Back-compat: country-level hints for a single date (banner / simple callers). */
export function getSeasonalHints(
  destinationIata: string,
  tripDate: string,
  lang: string,
  extra?: Omit<TripClimateOpts, "destinationIata" | "departDate" | "lang">,
): string[] {
  return buildTripClimate({
    destinationIata,
    departDate: tripDate,
    returnDate: extra?.returnDate,
    lang,
    priorities: extra?.priorities,
    wishes: extra?.wishes,
    regionCities: extra?.regionCities,
  }).tripClimate;
}
