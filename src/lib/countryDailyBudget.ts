/**
 * Mid-range / Standard daily budget per person (EUR).
 * Industry / EU-style estimate for 1 person/day assuming a shared double room:
 * 3★ hotel or private apt share + 3 meals + local transport + 1–2 attractions.
 * Excludes international flights / long-haul to destination and luxury shopping.
 *
 * Source: curated top-80 visited countries mid-range table (2026).
 */
export const COUNTRY_MID_DAILY_EUR: Record<string, number> = {
  FR: 130,
  ES: 120,
  US: 180,
  IT: 130,
  TR: 60,
  CN: 70,
  MX: 65,
  TH: 50,
  DE: 120,
  GB: 140,
  JP: 110,
  AT: 130,
  GR: 100,
  MY: 45,
  PT: 90,
  CA: 140,
  PL: 70,
  NL: 140,
  VN: 40,
  KR: 95,
  HR: 100,
  HU: 75,
  AE: 170,
  IN: 35,
  CH: 200,
  SG: 160,
  DK: 150,
  SE: 130,
  AU: 150,
  CZ: 80,
  ID: 45,
  EG: 40,
  MA: 50,
  SA: 120,
  BE: 130,
  ZA: 70,
  PH: 45,
  AR: 55,
  BR: 60,
  CO: 45,
  PE: 50,
  AL: 50,
  ME: 65,
  LK: 35,
  NO: 170,
  FI: 140,
  IE: 140,
  RO: 55,
  BG: 50,
  SK: 65,
  SI: 85,
  CY: 95,
  MT: 100,
  IS: 190,
  NZ: 140,
  KH: 35,
  LA: 30,
  NP: 30,
  JO: 80,
  OM: 100,
  GE: 45,
  AM: 40,
  KZ: 45,
  UZ: 35,
  CL: 70,
  CR: 85,
  PA: 75,
  DO: 90,
  JM: 110,
  CU: 60,
  KE: 75,
  TZ: 85,
  NA: 80,
  BW: 120,
  MZ: 70,
  ZM: 70,
  ZW: 70,
  MU: 130,
  SC: 180,
  MV: 200,
  QA: 150,
  TW: 70,
  TN: 40,
  // Balkans / neighbours not in top-80 list — aligned to regional peers.
  BA: 55,
  MK: 50,
  RS: 55,
  XK: 45,
  // Default Western / Nordic peers.
  LU: 150,
  LI: 190,
  MC: 220,
  AD: 120,
  EE: 90,
  LV: 75,
  LT: 75,
};

const DEFAULT_MID_DAILY_EUR = 100;

export function countryMidDailyBudgetEur(country?: string): number {
  const cc = (country ?? "").trim().toUpperCase();
  if (!cc) return DEFAULT_MID_DAILY_EUR;
  return COUNTRY_MID_DAILY_EUR[cc] ?? DEFAULT_MID_DAILY_EUR;
}

/** budget = mid − 30% · premium ≈ mid + 45% (lodging + dining step-up). */
export function countryTierDailyBudgetEur(
  country: string | undefined,
  tier: "budget" | "mid" | "premium",
): number {
  const mid = countryMidDailyBudgetEur(country);
  if (tier === "budget") return Math.max(20, Math.round(mid * 0.7));
  if (tier === "premium") return Math.round(mid * 1.45);
  return mid;
}

/**
 * Infer coarse price tier from industry mid daily (for meal/transfer bands).
 * ≥150 ≈ premium markets · ≤55 ≈ value · else mid.
 */
export function priceTierFromCountryMid(country?: string): "budget" | "mid" | "premium" {
  const mid = countryMidDailyBudgetEur(country);
  if (mid >= 150) return "premium";
  if (mid <= 55) return "budget";
  return "mid";
}

/**
 * Resolve ISO country for a day/place label (road-trip budgets).
 * "Berat" → AL, "Plitvice" → HR, "Kotor" → ME — not the trip's destination hub alone.
 */
export function inferBudgetCountryFromPlace(place?: string): string | null {
  const n = (place ?? "").trim().toLowerCase();
  if (!n) return null;

  if (/albania|albanij|tirana|berat|saranda|sarandë|himar|ksamil|gjirokast|shkod|shkodër|vlore|vlorë|durres|durrës|albanian\s*riviera|riviera\s*e\s*jonit|skadar|\btia\b/.test(n)) {
    return "AL";
  }
  if (/montenegro|črna\s*gora|crna\s*gora|kotor|budva|tivat|podgorica|herceg|\btiv\b|\btgd\b/.test(n)) {
    return "ME";
  }
  if (/bosnia|bosna|sarajevo|mostar|banja\s*luka|\bsjj\b/.test(n)) return "BA";
  if (/north\s*macedonia|severna\s*makedon|skopje|ohrid|\bskp\b/.test(n)) return "MK";
  if (/serbia|srbija|belgrade|beograd|niš|nis\b|\bbeg\b/.test(n)) return "RS";
  if (/kosovo|prishtina|priština|prizren/.test(n)) return "XK";
  if (/croatia|hrvašk|hrvatsk|plitvice|plitvič|dubrovnik|split|zadar|zagreb|korenica|pula|rovinj|istria|dalmatia/.test(n)) {
    return "HR";
  }
  if (/slovenia|slovenij|ljubljana|lju\b|bled|piran|maribor/.test(n)) return "SI";
  if (/bulgaria|bolgarij|sofia|\bsof\b/.test(n)) return "BG";
  if (/romania|romunij|bucharest|\botp\b/.test(n)) return "RO";
  if (/greece|grčij|athens|athen|corfu|crete|santorini|\bath\b/.test(n)) return "GR";
  if (/turkey|turčij|istanbul|antalya|cappadocia|\bist\b/.test(n)) return "TR";
  if (/egypt|egipt|cairo|luxor|giza|\bcai\b/.test(n)) return "EG";
  if (/morocco|marok|marrakech|casablanca|fez|\brak\b/.test(n)) return "MA";
  if (/tunisia|tunizij|tunis|\btun\b/.test(n)) return "TN";
  if (/georgia|gruzij|tbilisi/.test(n)) return "GE";
  if (/kenya|kenij|nairobi|maasai|amboseli|\bnbo\b/.test(n)) return "KE";
  if (/tanzania|tanzanij|serengeti|ngorongoro|zanzibar|arusha|\bjro\b/.test(n)) return "TZ";
  if (/maldives|maldiv|\bmle\b/.test(n)) return "MV";
  if (/dominican|dominikansk|punta\s*cana|bavaro|saona|\bpuj\b|\bsdq\b/.test(n)) return "DO";
  if (/mauritius|mavricij|\bmru\b/.test(n)) return "MU";
  if (/namibia|namibij|windhoek|etosha|sossusvlei|\bwdh\b/.test(n)) return "NA";
  if (/botswana|bocvan|maun|gaborone|chobe|okavango|makgadikgadi|kasane|\bgbe\b|\bmub\b/.test(n)) {
    return "BW";
  }
  if (/mozambique|mozambik|vilanculos|maputo|bazaruto|two mile|\bvnx\b/.test(n)) {
    return "MZ";
  }
  if (/south\s*africa|južna\s*afrik|kruger|cape\s*town|johannesburg|\bjnb\b|\bcpt\b/.test(n)) {
    return "ZA";
  }
  if (/italy|italij|rome|roma|florence|firenze|venice|milan|cortina|\bfco\b|\bmxp\b/.test(n)) {
    return "IT";
  }
  if (/austria|avstrij|vienna|dunaj|klagenfurt|celovec|\bvie\b/.test(n)) return "AT";
  if (/thailand|tajska|bangkok|phuket|krabi|chiang|patong|\bhkt\b|\bbkk\b/.test(n)) return "TH";
  if (/vietnam|hanoi|saigon|ho\s*chi|da\s*nang|hoi\s*an|\bhan\b|\bsgn\b/.test(n)) return "VN";
  if (/cambodia|kambodž|siem\s*reap|phnom|\brep\b|\bpnh\b/.test(n)) return "KH";
  if (/šri\s*lanka|sri\s*lanka|colombo|galle|ella|\bcmb\b/.test(n)) return "LK";
  if (/indonesia|indonezij|bali|ubud|jakarta|\bdps\b/.test(n)) return "ID";
  if (/philippines|filipin|manila|boracay|el\s*nido|cebu|\bmnl\b/.test(n)) return "PH";
  if (/malaysia|malezij|kuala|penang|\bkul\b/.test(n)) return "MY";
  if (/peru|lima|cusco|cuzco|machu/.test(n)) return "PE";
  if (/colombia|kolumbij|cartagena|bogot/.test(n)) return "CO";
  if (/mexico|mehik|cancun|cancún|tulum|yucat|holbox|playa\s*del\s*carmen|riviera\s*maya/.test(n)) return "MX";
  if (/portugal|portugalsk|lisbon|lisboa|porto/.test(n)) return "PT";
  if (/spain|španij|barcelona|madrid|seville|valencia/.test(n)) return "ES";
  if (/france|francij|paris|lyon|nice|marseille/.test(n)) return "FR";
  if (/netherlands|nizozemsk|amsterdam/.test(n)) return "NL";
  if (/germany|nemčij|berlin|munich|münchen|hamburg/.test(n)) return "DE";
  if (/switzerland|švic|zurich|zürich|geneva|bern/.test(n)) return "CH";
  if (/norway|norvešk|oslo|bergen/.test(n)) return "NO";
  if (/iceland|islandij|reykjav/.test(n)) return "IS";
  if (
    /united states|\busa\b|new york|\bnyc\b|manhattan|brooklyn|los angeles|san francisco|chicago|miami|boston|seattle|las vegas|washington|\bjfk\b|\bewr\b|\blga\b|\blax\b|\bsfo\b|\bord\b|\bmia\b/.test(
      n,
    )
  ) {
    return "US";
  }
  if (/united kingdom|\buk\b|england|london|manchester|\blhr\b|\blgw\b/.test(n)) return "GB";
  if (/japan|japonsk|tokyo|osaka|kyoto|\bnrt\b|\bhnd\b/.test(n)) return "JP";

  return null;
}

/** Prefer day-city country, then destination *name*, then hub country (never let LJU poison Albania). */
export function resolveDayBudgetCountry(opts: {
  dayCity?: string;
  destinationCountry?: string;
  destinationName?: string;
  destinationIata?: string;
}): string {
  const fromDay = inferBudgetCountryFromPlace(opts.dayCity);
  if (fromDay) return fromDay;

  const fromDest = inferBudgetCountryFromPlace(
    `${opts.destinationName ?? ""} ${opts.destinationIata ?? ""}`,
  );
  const destCc = (opts.destinationCountry ?? "").trim().toUpperCase();

  // Explicit trip name beats a poisoned hub locale (LJU→SI while name is Albania).
  if (fromDest && destCc && fromDest !== destCc) return fromDest;
  if (destCc && destCc !== "XX" && COUNTRY_MID_DAILY_EUR[destCc] != null) return destCc;
  if (fromDest) return fromDest;
  return destCc || "XX";
}
