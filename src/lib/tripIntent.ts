import { lookupDestination } from "@/lib/destinationCoords";

/** Structured steer derived from free-text wishes + flight context. */
export type TripIntent = {
  /** ISO country codes mentioned or inferred (order preserved). */
  countries: string[];
  /** e.g. VN_TH — drives programmatic blueprints. */
  routeId?: string;
  minIslandDays?: number;
  /** User asked for relaxed/slow pace on islands/beaches. */
  islandRelaxPace?: boolean;
  intensive?: boolean;
};

/** Country detection from free-text wishes (SL + EN keywords). */
export const COUNTRY_PATTERNS: Array<{ code: string; test: RegExp }> = [
  { code: "VN", test: /vietnam|vietnamu|vjetnam|ho chi minh|hanoi|ha long|phu quoc|hoi an|da nang/i },
  { code: "TH", test: /tajsk|thailand|thai\b|bangkok|koh lipe|phuket|krabi|phi phi|koh samui|chiang mai/i },
  { code: "ID", test: /indonezij|indonesia|bali|ubud|gili|lombok|komodo|raja ampat|jakarta/i },
  { code: "PH", test: /filipin|philippines|boracay|el nido|palawan|cebu|manila/i },
  { code: "MY", test: /malezij|malaysia|langkawi|perhentian|kuala lumpur/i },
  { code: "KH", test: /kambodž|cambodia|siem reap|angkor|phnom penh/i },
  { code: "HR", test: /hrvašk|croatia|dubrovnik|hvar|split/i },
  { code: "GR", test: /grčij|greece|santorini|mykonos|athens|aten|acropolis/i },
  { code: "ES", test: /španij|spain|barcelona|madrid|sevilla|andaluz|málaga|malaga|ibiza/i },
  { code: "IT", test: /italij|italy|rome|roma|milan|milano|venice|venecij|florence|firenze|amalfi/i },
  { code: "FR", test: /francij|france|paris|pariz|lyon|nice|côte d'azur|provence/i },
  { code: "GB", test: /anglešk|united kingdom|\buk\b|england|london|londra|edinburgh|scotland/i },
  { code: "DE", test: /nemčij|germany|berlin|munich|münchen|bavaria|bavarsk/i },
  { code: "AT", test: /avstrij|austria|vienna|dunaj|salzburg/i },
  { code: "CH", test: /švicar|switzerland|zurich|zürich|geneva|ženev|interlaken/i },
  { code: "PT", test: /portugal|lisbon|lizbona|porto|algarve/i },
  { code: "NL", test: /nizozem|netherlands|holland|amsterdam|rotterdam/i },
  { code: "TR", test: /turčij|turkey|istanbul|cappadocia|kapadokij/i },
  { code: "AE", test: /dubai|emirat|uae|abu dhabi/i },
  { code: "JP", test: /japonsk|japan|tokyo|tokio|kyoto|osaka|hiroshima|mount fuji/i },
  { code: "KR", test: /korej|korea|seoul|busan|jeju/i },
  { code: "CN", test: /kitajsk|china|beijing|peking|shanghai|great wall/i },
  { code: "HK", test: /hong kong|hongkong/i },
  { code: "SG", test: /singapur|singapore/i },
  { code: "AU", test: /australij|australia|sydney|melbourne|brisbane|great barrier/i },
  { code: "NZ", test: /novi zeland|new zealand|auckland|queenstown|milford/i },
  { code: "US", test: /amerik|united states|\busa\b|\bus\b|new york|los angeles|california|hawaii|havaj|las vegas|miami|route 66/i },
  { code: "CA", test: /kanad|canada|toronto|vancouver|montreal|banff|niagara/i },
  { code: "MX", test: /mehik|mexico|cancún|cancun|tulum|mexico city/i },
  { code: "BR", test: /brazil|brazilij|rio de janeiro|são paulo|sao paulo/i },
  { code: "AR", test: /argent|argentina|buenos aires|patagonia/i },
  { code: "PE", test: /peru|lima|cusco|cuzco|machu picchu/i },
  { code: "EG", test: /egipt|egypt|cairo|kairo|luxor|pyramid/i },
  { code: "MA", test: /marok|morocco|marrakech|fes|sahara/i },
  { code: "ZA", test: /južna afrik|south africa|cape town|johannesburg|kruger|garden route/i },
  { code: "BW", test: /botswana|bocvana|botsvana|gaborone|maun|okavango|chobe|kasane|makgadikgadi|kalahari/i },
  { code: "NA", test: /namibia|namibija|windhoek|etosha|sossusvlei|sesriem|swakopmund|damaraland/i },
  { code: "KE", test: /kenya|kenija|nairobi|maasai mara|amboseli|nakuru|tsavo/i },
  { code: "TZ", test: /tanzanij|tanzania|zanzibar|serengeti|kilimanjaro/i },
  { code: "MV", test: /maldiv|maldives/i },
  { code: "CY", test: /cyp|cyprus|paphos|larnaca|ayia napa/i },
  { code: "CZ", test: /češk|czech|prague|praga/i },
  { code: "HU", test: /madžar|hungary|budapest/i },
  { code: "IS", test: /islandija|iceland|reykjavik|golden circle/i },
  { code: "IE", test: /irsk|ireland|dublin/i },
  { code: "IN", test: /indij|india|delhi|mumbai|goa|taj mahal/i },
  { code: "IL", test: /izrael|israel|tel aviv|jerusalem/i },
  { code: "QA", test: /katar|qatar|doha/i },
];

function detectCountriesInText(wishes: string): string[] {
  const found: string[] = [];
  for (const { code, test } of COUNTRY_PATTERNS) {
    if (test.test(wishes) && !found.includes(code)) found.push(code);
  }
  return found;
}

function inferCountriesFromFlights(
  destinationIata?: string,
  returnFromIata?: string,
): string[] {
  const out: string[] = [];
  const dest = destinationIata ? lookupDestination(destinationIata) : null;
  const ret = returnFromIata ? lookupDestination(returnFromIata) : null;
  if (dest?.country && !out.includes(dest.country)) out.push(dest.country);
  if (ret?.country && ret.country !== dest?.country && !out.includes(ret.country)) {
    out.push(ret.country);
  }
  return out;
}

function mergeCountries(textCountries: string[], flightCountries: string[]): string[] {
  const out = [...textCountries];
  for (const c of flightCountries) {
    if (!out.includes(c)) out.push(c);
  }
  return out;
}

function routeIdFromCountries(countries: string[]): string | undefined {
  const set = new Set(countries);
  if (set.has("VN") && set.has("KH") && set.has("TH")) return "VN_KH_TH";
  if (set.has("VN") && set.has("KH")) return "VN_KH";
  if (set.has("VN") && set.has("TH")) return "VN_TH";
  return undefined;
}

/** Parse "najmanj 5 dni", "5 dni na otokih", etc. */
export function parseMinIslandDays(wishes?: string): number | undefined {
  if (!wishes?.trim()) return undefined;
  const m = wishes.match(
    /(?:najmanj|vsaj|min(?:imum)?|at least)\s*(\d{1,2})\s*(?:dni|days|dan\b)/i,
  );
  if (m) return Math.max(2, Math.min(12, Number(m[1])));
  const m2 = wishes.match(/(\d{1,2})\s*(?:dni|days)\s*(?:na\s+)?(?:otok|island|plaž)/i);
  if (m2) return Math.max(2, Math.min(12, Number(m2[1])));
  return undefined;
}

/** Build structured trip intent from wishes + optional flight/pace context. */
export function extractTripIntent(
  wishes?: string,
  opts?: {
    destinationIata?: string;
    returnFromIata?: string;
    pace?: string;
  },
): TripIntent {
  const w = (wishes ?? "").toLowerCase();
  const textCountries = wishes?.trim() ? detectCountriesInText(wishes) : [];
  const flightCountries = inferCountriesFromFlights(
    opts?.destinationIata,
    opts?.returnFromIata,
  );
  const countries = mergeCountries(textCountries, flightCountries);

  const islandRelaxPace =
    /sproščen|sproscen|relaxed|pocasen|počasen|slow|otokih.*sprošč|beach.*relax/i.test(w) ||
    (/otok|plaž|island|beach/i.test(w) && /sproščen|relaxed|pocas/i.test(w));

  const intensive =
    opts?.pace === "intensive" ||
    /intenziven|intensive|hitro|packed|čim več|co več/i.test(w);

  const intent: TripIntent = {
    countries,
    minIslandDays: parseMinIslandDays(wishes),
    islandRelaxPace: islandRelaxPace || undefined,
    intensive: intensive || undefined,
  };

  intent.routeId = routeIdFromCountries(countries);
  return intent;
}

/** Human-readable steer for the AI skeleton prompt. */
export function tripIntentPromptRule(intent: TripIntent, langCode: string): string | undefined {
  if (!intent.routeId && intent.countries.length < 2) return undefined;
  const slo = langCode === "sl" || langCode.startsWith("sl");

  if (intent.routeId === "VN_TH") {
    const island = intent.minIslandDays
      ? slo
        ? `≥${intent.minIslandDays} dni na tajskih otokih (Koh Lipe)`
        : `≥${intent.minIslandDays} days on Thai islands (Koh Lipe)`
      : slo
        ? "tajski otoki (Krabi/Koh Lipe)"
        : "Thai islands (Krabi/Koh Lipe)";
    return slo
      ? `Potovanje VN+TH: Vietnam intenzivno, ${island}${intent.islandRelaxPace ? ", sproščen tempo na otokih" : ""}. Zadnja regija Bangkok če returnHub=TH.`
      : `VN+TH trip: intensive Vietnam, then ${island}${intent.islandRelaxPace ? ", relaxed island pace" : ""}. Final region Bangkok if returnHub is TH.`;
  }

  if (intent.countries.length >= 2) {
    return slo
      ? `Večdržavno potovanje: ${intent.countries.join(" → ")} — returnHub je obvezen; regionBlueprint je predlog.`
      : `Multi-country: ${intent.countries.join(" → ")} — returnHub is required; regionBlueprint is a hint.`;
  }

  return undefined;
}
