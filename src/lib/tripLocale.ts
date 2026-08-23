import { lookupDestination } from "@/lib/destinationCoords";
import { formatSlHours } from "@/lib/flightScheduling";
import { planLangCopy } from "@/lib/planLangCopy";
import { normalizePlanLangCode, type PlanLang } from "@/lib/planLanguages";
import {
  formatPlanMoneyRange,
  normalizePlanCurrency,
  type PlanCurrency,
} from "@/lib/planCurrency";
import {
  COUNTRY_MID_DAILY_EUR,
  priceTierFromCountryMid,
} from "@/lib/countryDailyBudget";

export type TripLocale = {
  langCode: string;
  slo: boolean;
  country: string;
  countryName: string;
  destinationIata: string;
  /** User-selected display currency (EUR or USD). */
  displayCurrency: PlanCurrency;
  /** Airport ↔ hotel transfer price band. */
  transferPrice: string;
  mealPrice: string;
  massagePrice: string;
  /** Short label for UI (e.g. "Metro / taxi", "Uber / taxi"). */
  transferLabel: string;
  /** For AI localTransportTips — region-appropriate modes. */
  localTransportModes: string;
};

const COUNTRY_NAMES: Record<string, { sl: string; en: string }> = {
  SI: { sl: "Slovenija", en: "Slovenia" },
  IT: { sl: "Italija", en: "Italy" },
  FR: { sl: "Francija", en: "France" },
  GB: { sl: "Velika Britanija", en: "United Kingdom" },
  DE: { sl: "Nemčija", en: "Germany" },
  AT: { sl: "Avstrija", en: "Austria" },
  CH: { sl: "Švica", en: "Switzerland" },
  ES: { sl: "Španija", en: "Spain" },
  PT: { sl: "Portugalska", en: "Portugal" },
  GR: { sl: "Grčija", en: "Greece" },
  TR: { sl: "Turčija", en: "Turkey" },
  AE: { sl: "Združeni arabski emirati", en: "UAE" },
  SG: { sl: "Singapur", en: "Singapore" },
  MY: { sl: "Malezija", en: "Malaysia" },
  TH: { sl: "Tajska", en: "Thailand" },
  VN: { sl: "Vietnam", en: "Vietnam" },
  PH: { sl: "Filipini", en: "Philippines" },
  ID: { sl: "Indonezija", en: "Indonesia" },
  LK: { sl: "Šrilanka", en: "Sri Lanka" },
  IN: { sl: "Indija", en: "India" },
  JP: { sl: "Japonska", en: "Japan" },
  KR: { sl: "Južna Koreja", en: "South Korea" },
  AU: { sl: "Avstralija", en: "Australia" },
  US: { sl: "ZDA", en: "United States" },
  MX: { sl: "Mehika", en: "Mexico" },
  BR: { sl: "Brazilija", en: "Brazil" },
  AR: { sl: "Argentina", en: "Argentina" },
  ZA: { sl: "Južna Afrika", en: "South Africa" },
  EG: { sl: "Egipt", en: "Egypt" },
  MA: { sl: "Maroko", en: "Morocco" },
  TZ: { sl: "Tanzanija", en: "Tanzania" },
  CA: { sl: "Kanada", en: "Canada" },
  XX: { sl: "destinacija", en: "destination" },
};

/** Price tier for € display (Slovenian UI) — not tied to a single region. */
export type PriceTier = "premium" | "mid" | "budget";

const TIER_BY_COUNTRY: Record<string, PriceTier> = {
  US: "premium",
  CA: "premium",
  AU: "premium",
  JP: "premium",
  KR: "premium",
  SG: "premium",
  CH: "premium",
  AE: "premium",
  GB: "premium",
  FR: "mid",
  DE: "mid",
  IT: "mid",
  AT: "mid",
  ES: "mid",
  PT: "mid",
  GR: "mid",
  TR: "mid",
  SI: "mid",
  ZA: "mid",
  TZ: "mid",
  AR: "mid",
  BR: "mid",
  MX: "mid",
  MA: "budget",
  EG: "budget",
  AL: "budget",
  BA: "budget",
  ME: "budget",
  MK: "budget",
  RS: "budget",
  XK: "budget",
  BG: "budget",
  RO: "budget",
  HR: "mid",
  TH: "budget",
  VN: "budget",
  PH: "budget",
  ID: "budget",
  MY: "budget",
  LK: "budget",
  IN: "budget",
  KH: "budget",
  LA: "budget",
  NP: "budget",
};

const EUR_BANDS: Record<PriceTier, { transfer: string; meal: string; massage: string }> = {
  premium: { transfer: "25–50 €", meal: "15–30 €", massage: "18–35 €" },
  mid: { transfer: "15–35 €", meal: "10–22 €", massage: "12–25 €" },
  budget: { transfer: "5–15 €", meal: "4–12 €", massage: "8–18 €" },
};

const TRANSPORT_BY_COUNTRY: Record<
  string,
  { label: { sl: string; en: string }; modes: { sl: string; en: string } }
> = {
  TH: {
    label: { sl: "Grab / taxi", en: "Grab / taxi" },
    modes: { sl: "Grab, BTS/MRT, taxi", en: "Grab, BTS/MRT, taxi" },
  },
  VN: {
    label: { sl: "Grab / taxi", en: "Grab / taxi" },
    modes: { sl: "Grab, xe om, lokalni bus", en: "Grab, motorbike taxi, local bus" },
  },
  PH: {
    label: { sl: "Grab / taxi", en: "Grab / taxi" },
    modes: { sl: "Grab, jeepney, taxi", en: "Grab, jeepney, taxi" },
  },
  ID: {
    label: { sl: "Grab / Gojek", en: "Grab / Gojek" },
    modes: { sl: "Grab, Gojek, taxi", en: "Grab, Gojek, taxi" },
  },
  MY: {
    label: { sl: "Grab / taxi", en: "Grab / taxi" },
    modes: { sl: "Grab, LRT/MRT, taxi", en: "Grab, LRT/MRT, taxi" },
  },
  LK: {
    label: { sl: "PickMe / tuk-tuk", en: "PickMe / tuk-tuk" },
    modes: { sl: "PickMe, tuk-tuk, vlak, taxi", en: "PickMe, tuk-tuk, train, taxi" },
  },
  IN: {
    label: { sl: "Uber / Ola / tuk-tuk", en: "Uber / Ola / auto" },
    modes: { sl: "Uber, Ola, tuk-tuk, metro", en: "Uber, Ola, auto-rickshaw, metro" },
  },
  SG: {
    label: { sl: "MRT / taxi", en: "MRT / taxi" },
    modes: { sl: "MRT, Grab, taxi", en: "MRT, Grab, taxi" },
  },
  JP: {
    label: { sl: "vlak / taxi", en: "train / taxi" },
    modes: { sl: "JR/metro, taxi", en: "JR/metro, taxi" },
  },
  KR: {
    label: { sl: "metro / Kakao T", en: "subway / Kakao T" },
    modes: { sl: "metro, Kakao T, taxi", en: "subway, Kakao T, taxi" },
  },
  US: {
    label: { sl: "Uber / Lyft / taxi", en: "Uber / Lyft / taxi" },
    modes: {
      sl: "metro (OMNY), Uber, Lyft, taxi, AirTrain (JFK)",
      en: "subway (OMNY), Uber, Lyft, taxi, AirTrain (JFK)",
    },
  },
  CA: {
    label: { sl: "Uber / taxi / javni prevoz", en: "Uber / taxi / transit" },
    modes: {
      // Never say "no Grab" next to Uber — Gemini mangles it into "no Uber in Canada".
      sl: "Uber, taxi, TTC/TransLink",
      en: "Uber, taxi, TTC/TransLink",
    },
  },
  GB: {
    label: { sl: "Tube / taxi", en: "Tube / taxi" },
    modes: { sl: "Tube, bus, Uber, črn taxi", en: "Tube, bus, Uber, black cab" },
  },
  FR: {
    label: { sl: "metro / taxi", en: "metro / taxi" },
    modes: { sl: "metro, RER, taxi, Uber", en: "metro, RER, taxi, Uber" },
  },
  DE: {
    label: { sl: "S-Bahn / taxi", en: "S-Bahn / taxi" },
    modes: { sl: "S-Bahn, U-Bahn, tramvaj, taxi", en: "S-Bahn, U-Bahn, tram, taxi" },
  },
  IT: {
    label: { sl: "metro / taxi", en: "metro / taxi" },
    modes: { sl: "metro, tramvaj, taxi", en: "metro, tram, taxi" },
  },
  ES: {
    label: { sl: "metro / taxi", en: "metro / taxi" },
    modes: { sl: "metro, bus, taxi", en: "metro, bus, taxi" },
  },
  PT: {
    label: { sl: "metro / taxi", en: "metro / taxi" },
    modes: { sl: "metro, tramvaj, taxi", en: "metro, tram, taxi" },
  },
  AT: {
    label: { sl: "U-Bahn / taxi", en: "U-Bahn / taxi" },
    modes: { sl: "U-Bahn, tramvaj, taxi", en: "U-Bahn, tram, taxi" },
  },
  CH: {
    label: { sl: "vlak / taxi", en: "train / taxi" },
    modes: { sl: "S-Bahn, tramvaj, taxi", en: "S-Bahn, tram, taxi" },
  },
  GR: {
    label: { sl: "metro / taxi", en: "metro / taxi" },
    modes: { sl: "metro, bus, taxi", en: "metro, bus, taxi" },
  },
  TR: {
    label: { sl: "metro / taxi", en: "metro / taxi" },
    modes: { sl: "metro, tramvaj, taxi", en: "metro, tram, taxi" },
  },
  AE: {
    label: { sl: "Careem / taxi", en: "Careem / taxi" },
    modes: { sl: "Careem, metro (Dubai), taxi", en: "Careem, metro (Dubai), taxi" },
  },
  AU: {
    label: { sl: "vlak / Uber", en: "train / Uber" },
    modes: { sl: "vlak, bus, Uber, taxi", en: "train, bus, Uber, taxi" },
  },
  MX: {
    label: { sl: "Uber / taxi", en: "Uber / taxi" },
    modes: { sl: "Uber, metro (CDMX), taxi", en: "Uber, metro (CDMX), taxi" },
  },
  BR: {
    label: { sl: "Uber / metro", en: "Uber / metro" },
    modes: { sl: "Uber, metro, taxi", en: "Uber, metro, taxi" },
  },
  AR: {
    label: { sl: "Uber / taxi", en: "Uber / taxi" },
    modes: { sl: "Uber, metro (Buenos Aires), taxi", en: "Uber, metro, taxi" },
  },
  ZA: {
    label: { sl: "Uber / taxi", en: "Uber / taxi" },
    modes: { sl: "Uber, taxi, minibus", en: "Uber, taxi, minibus" },
  },
  EG: {
    label: { sl: "Uber / taxi", en: "Uber / taxi" },
    modes: { sl: "Uber, metro (Kairo), taxi", en: "Uber, metro (Cairo), taxi" },
  },
  MA: {
    label: { sl: "taxi / petit taxi", en: "taxi / petit taxi" },
    modes: { sl: "petit taxi, Uber (večja mesta), peš", en: "petit taxi, Uber (big cities), walking" },
  },
};

const DEFAULT_TRANSPORT = {
  label: { sl: "taxi / prevozna aplikacija", en: "taxi / ride app" },
  modes: { sl: "javni prevoz, taxi, lokalna prevozna aplikacija", en: "public transit, taxi, local ride app" },
};

function inferCountryFromName(destinationName: string): string | null {
  const n = destinationName.trim().toLowerCase();
  if (!n) return null;
  if (/šri\s*lanka|sri\s*lanka|srilanka|cejlon|colombo|galle|ella|negombo/.test(n)) {
    return "LK";
  }
  if (/tajska|thailand|bangkok|phuket|krabi|chiang\s*mai/.test(n)) return "TH";
  if (/vietnam|saigon|hanoi|ho\s*chi\s*minh|da\s*nang|hoi\s*an/.test(n)) return "VN";
  if (/filipini|philippines|manila|boracay|cebu|palawan/.test(n)) return "PH";
  if (/indonezija|indonesia|bali|jakarta/.test(n)) return "ID";
  if (/indija|india|delhi|mumbai|goa/.test(n)) return "IN";
  if (/malezija|malaysia|kuala|penang/.test(n)) return "MY";
  if (/kambodž|cambodia|siem\s*reap|phnom\s*penh/.test(n)) return "KH";
  if (/laos|\bluang\b|\bvientiane\b/.test(n)) return "LA";
  if (/nepal|\bkathmandu\b/.test(n)) return "NP";
  // Balkans — car trips often arrive as "Albania, AL" without a usable IATA.
  if (/albanij|albania|\btirana\b|\bberat\b|\bsaranda\b/.test(n)) return "AL";
  if (/črna\s*gora|crna\s*gora|montenegro|\bkotor\b|\bbudva\b/.test(n)) return "ME";
  if (/bosna|bosnia|\bmostar\b|\bsarajevo\b/.test(n)) return "BA";
  if (/srbij|serbia|\bbeograd\b|\bbelgrade\b/.test(n)) return "RS";
  if (/makedon|macedonia|\bskopje\b|\bohrid\b/.test(n)) return "MK";
  if (/kosov|prishtina|priština/.test(n)) return "XK";
  if (/bolgarij|bulgaria|\bsofia\b/.test(n)) return "BG";
  if (/romunij|romania|\bbucharest\b/.test(n)) return "RO";
  if (/hrvašk|hrvatsk|croatia|\bdubrovnik\b|\bsplit\b|\bzadar\b|\bplitvic/.test(n)) {
    return "HR";
  }
  if (/slovenij|slovenia|\bljubljana\b/.test(n)) return "SI";
  if (/turčij|turkey|türkiye|\bistambul\b|\bistanbul\b|\bantalya\b/.test(n)) return "TR";
  if (/egipt|egypt|\bcairo\b|\bluxor\b/.test(n)) return "EG";
  if (/marok|morocco|\bmarrakech\b|\bcasablanca\b/.test(n)) return "MA";
  if (/tunizij|tunisia|\btunis\b/.test(n)) return "TN";
  if (/gruzij|georgia|\btbilisi\b/.test(n)) return "GE";
  if (/armenij|armenia|\byerevan\b/.test(n)) return "AM";
  if (/kenij|kenya|\bnairobi\b|\bmara\b/.test(n)) return "KE";
  if (/tanzanij|tanzania|\bserengeti\b|\bzanzibar\b/.test(n)) return "TZ";
  if (/namibij|namibia|\bwindhoek\b|\betosha\b/.test(n)) return "NA";
  if (/bocvan|botswana|\bmaun\b|\bgaborone\b/.test(n)) return "BW";
  if (/portugalsk|portugal|\blisbon\b|\blisboa\b|\bporto\b/.test(n)) return "PT";
  if (/nizozemsk|netherlands|\bamsterdam\b/.test(n)) return "NL";
  if (/poljsk|poland|\bwarsaw\b|\bkrakow\b|\bkraków\b/.test(n)) return "PL";
  if (/češk|czech|\bprague\b|\bpraha\b/.test(n)) return "CZ";
  if (/madžarsk|hungary|\bbudapest\b/.test(n)) return "HU";
  if (/slovašk|slovakia|\bbratislava\b/.test(n)) return "SK";
  if (/danska|denmark|\bcopenhagen\b/.test(n)) return "DK";
  if (/švedsk|sweden|\bstockholm\b/.test(n)) return "SE";
  if (/finska|finland|\bhelsinki\b/.test(n)) return "FI";
  if (/irland|ireland|\bdublin\b/.test(n)) return "IE";
  if (/islandij|iceland|\breykjav/.test(n)) return "IS";
  if (/italij|italy|\brome\b|\broma\b|\bflorence\b|\bvenice\b/.test(n)) return "IT";
  if (/španij|spanij|spain|\bbarcelona\b|\bmadrid\b/.test(n)) return "ES";
  if (/francij|france|\bparis\b|\blyon\b/.test(n)) return "FR";
  if (/grčij|greece|\bathens\b/.test(n)) return "GR";
  if (/avstrij|austria|\bvienna\b|\bdunaj\b/.test(n)) return "AT";
  if (/nemčij|germany|\bberlin\b|\bmunich\b|\bmünchen\b/.test(n)) return "DE";
  if (/švic|switzerland|\bzurich\b|\bzürich\b/.test(n)) return "CH";
  if (/norvešk|norway|\boslo\b/.test(n)) return "NO";
  if (/belgij|belgium|\bbrussels\b/.test(n)) return "BE";
  if (/mehik|mexico|\bcancun\b|\bcancún\b/.test(n)) return "MX";
  if (/peruj|peru|\blima\b|\bcusco\b|\bcuzco\b/.test(n)) return "PE";
  if (/kolumbij|colombia|\bcartagena\b|\bbogot/.test(n)) return "CO";
  if (/brazil|brasil|\briode?\s*janeiro\b|\bs[aã]o\s*paulo\b/.test(n)) return "BR";
  if (/argentin|\bbuenos\s*aires\b/.test(n)) return "AR";
  if (/čil|chile|\bsantiago\b/.test(n)) return "CL";
  if (/new york|\bnyc\b|manhattan|united states|\busa\b/.test(n)) return "US";
  return null;
}

/**
 * Prefer an explicit destination *name* when it conflicts with the IATA hub country.
 * Car trips often pass origin LJU as destinationIata while name is "Albania".
 */
function inferCountry(destinationIata: string, destinationName: string): string {
  const fromName = inferCountryFromName(destinationName);
  const fromIata = lookupDestination(destinationIata)?.country;
  if (fromName && fromIata && fromName !== fromIata) return fromName;
  if (fromIata) return fromIata;
  return fromName ?? "XX";
}

function tierPriceBands(
  country: string,
  currency: PlanCurrency,
): { transfer: string; meal: string; massage: string } {
  const tier = TIER_BY_COUNTRY[country] ?? "mid";
  const band = EUR_BANDS[tier];
  const parse = (s: string) => {
    const m = /(\d+)\s*[-–]\s*(\d+)/.exec(s);
    if (!m) return s;
    return formatPlanMoneyRange(Number(m[1]), Number(m[2]), currency);
  };
  // TH airport→beach (HKT→Patong etc.) is mid-tier Grab/taxi, not tuk-tuk 5–15 €.
  const transferBand = country === "TH" ? EUR_BANDS.mid.transfer : band.transfer;
  return {
    transfer: parse(transferBand),
    meal: parse(band.meal),
    massage: parse(band.massage),
  };
}

export function getPriceTier(country: string): PriceTier {
  const cc = (country ?? "").trim().toUpperCase();
  if (cc && COUNTRY_MID_DAILY_EUR[cc] != null) {
    return priceTierFromCountryMid(cc);
  }
  return TIER_BY_COUNTRY[cc] ?? "mid";
}

/** Midpoint of one meal band × 3 meals (per person). */
export function dailyMealsBudgetEur(tier: PriceTier): number {
  const band = EUR_BANDS[tier].meal;
  const m = /(\d+)\s*[-–]\s*(\d+)/.exec(band);
  const mid = m ? (Number(m[1]) + Number(m[2])) / 2 : 15;
  return Math.round(mid * 3);
}

export function minDailyBudgetEur(tier: PriceTier): number {
  return { premium: 70, mid: 40, budget: 28 }[tier];
}

/** Uber/metro allowance for a sightseeing day (per person). */
export function localTransitAllowanceEur(tier: PriceTier, sprawling: boolean): number {
  if (sprawling) return tier === "premium" ? 35 : tier === "mid" ? 22 : 12;
  return tier === "premium" ? 18 : tier === "mid" ? 10 : 5;
}

export function resolveTripLocale(
  destinationIata: string,
  destinationName: string,
  langCode = "sl",
  displayCurrency: PlanCurrency = "EUR",
): TripLocale {
  const code = normalizePlanLangCode(langCode);
  const slo = code === "sl";
  const currency = normalizePlanCurrency(displayCurrency);
  const country = inferCountry(destinationIata, destinationName);
  const names = COUNTRY_NAMES[country] ?? COUNTRY_NAMES.XX;
  const transport = TRANSPORT_BY_COUNTRY[country] ?? DEFAULT_TRANSPORT;
  const bands = tierPriceBands(country, currency);
  const iata = destinationIata.toUpperCase();
  const nycHub = /^(JFK|EWR|LGA)$/.test(iata);

  return {
    langCode: code,
    slo,
    country,
    countryName: slo ? names.sl : names.en,
    destinationIata: iata,
    displayCurrency: currency,
    transferPrice: nycHub ? formatPlanMoneyRange(45, 75, currency) : bands.transfer,
    mealPrice: bands.meal,
    massagePrice: bands.massage,
    transferLabel: slo ? transport.label.sl : transport.label.en,
    localTransportModes: slo ? transport.modes.sl : transport.modes.en,
  };
}

export function airportArrivalHint(city: string, locale: TripLocale): string {
  const lang = locale.langCode;
  const hub = lookupDestination(locale.destinationIata);
  const c = city.toLowerCase();

  if (hub && (!city || c.includes(hub.name.toLowerCase().split(" ")[0] ?? ""))) {
    return planLangCopy(lang, {
      sl: `Preveri letališče na vstopnici — prihod je na ${locale.destinationIata} (${hub.name}).`,
      en: `Check your ticket — you arrive at ${locale.destinationIata} (${hub.name}).`,
      de: `Prüfe dein Ticket — Ankunft auf ${locale.destinationIata} (${hub.name}).`,
      it: `Controlla il biglietto — arrivi a ${locale.destinationIata} (${hub.name}).`,
      es: `Revisa tu billete — llegas a ${locale.destinationIata} (${hub.name}).`,
      fr: `Vérifiez votre billet — arrivée à ${locale.destinationIata} (${hub.name}).`,
    });
  }

  if (locale.country === "TH" && /bangkok/.test(c)) {
    return planLangCopy(lang, {
      sl: "Preveri na vstopnici: BKK (Suvarnabhumi) ali DMK (Don Mueang).",
      en: "Check ticket: BKK (Suvarnabhumi) or DMK (Don Mueang).",
      de: "Ticket prüfen: BKK (Suvarnabhumi) oder DMK (Don Mueang).",
    });
  }
  if (locale.country === "VN" && /ho chi minh|saigon/.test(c)) {
    return planLangCopy(lang, {
      sl: "Preveri letališče: SGN (Tan Son Nhat).",
      en: "Check your ticket: SGN (Tan Son Nhat).",
      de: "Ticket prüfen: SGN (Tan Son Nhat).",
    });
  }

  return planLangCopy(lang, {
    sl: "Preveri kodo letališča in terminal na letalski vstopnici pred izhodom.",
    en: "Check airport code and terminal on your ticket before leaving arrivals.",
    de: "Flughafencode und Terminal vor dem Verlassen der Ankunft prüfen.",
  });
}

export function hotelTransferDescription(city: string, locale: TripLocale): string {
  const iata = locale.destinationIata.toUpperCase();
  const price = locale.transferPrice;
  const hub = HUB_HOTEL_TRANSFER[iata];
  if (hub) {
    return planLangCopy(locale.langCode, {
      sl: hub.sl(city, iata, price),
      en: hub.en(city, iata, price),
      de: hub.de(city, iata, price),
    });
  }
  const modes = locale.transferLabel;
  return planLangCopy(locale.langCode, {
    sl: `Iz ${iata} do hotela v ${city}: ${modes} (okvirno ${price}).`,
    en: `From ${iata} to your hotel in ${city}: ${modes} (about ${price}).`,
    de: `Von ${iata} zum Hotel in ${city}: ${modes} (ca. ${price}).`,
    it: `Da ${iata} all'hotel a ${city}: ${modes} (circa ${price}).`,
    es: `De ${iata} al hotel en ${city}: ${modes} (aprox. ${price}).`,
    fr: `De ${iata} à l'hôtel à ${city} : ${modes} (env. ${price}).`,
  });
}

type HubTransferCopy = {
  sl: (city: string, iata: string, price: string) => string;
  en: (city: string, iata: string, price: string) => string;
  de: (city: string, iata: string, price: string) => string;
};

const HUB_HOTEL_TRANSFER: Record<string, HubTransferCopy> = {
  JFK: {
    sl: (city, iata, price) =>
      `Iz ${iata} do hotela v ${city}: AirTrain + metro (~€12, 60–90 min). Uber/Lyft je ${price} in v gneči traja dlje.`,
    en: (city, iata, price) =>
      `From ${iata} to ${city}: AirTrain + subway (~€12, 60–90 min). Uber/Lyft is about ${price} in traffic.`,
    de: (city, iata, price) =>
      `Von ${iata} nach ${city}: AirTrain + U-Bahn (~€12, 60–90 Min.). Uber/Lyft ca. ${price}.`,
  },
  EWR: {
    sl: (city, iata, price) =>
      `Iz ${iata} do ${city}: AirTrain + NJ Transit/PATH ali Uber (${price}, 45–75 min).`,
    en: (city, iata, price) =>
      `From ${iata} to ${city}: AirTrain + NJ Transit/PATH, or Uber (${price}, 45–75 min).`,
    de: (city, iata, price) =>
      `Von ${iata} nach ${city}: AirTrain + NJ Transit/PATH oder Uber (${price}, 45–75 Min.).`,
  },
  LGA: {
    sl: (city, iata, price) =>
      `Iz ${iata} do ${city}: Q70 SBS + metro ali Uber (${price}, 40–70 min). Ni AirTraina.`,
    en: (city, iata, price) =>
      `From ${iata} to ${city}: Q70 SBS + subway, or Uber (${price}, 40–70 min). No AirTrain.`,
    de: (city, iata, price) =>
      `Von ${iata} nach ${city}: Q70 SBS + U-Bahn oder Uber (${price}, 40–70 Min.).`,
  },
  CDG: {
    sl: (city) => `Iz CDG do ${city}: RER B do centra (~45–60 min) ali Roissybus. Taxi je dražji v gneči.`,
    en: (city) => `From CDG to ${city}: RER B to the centre (~45–60 min) or Roissybus. Taxi costs more in traffic.`,
    de: (city) => `Von CDG nach ${city}: RER B ins Zentrum (~45–60 Min.) oder Roissybus.`,
  },
  ORY: {
    sl: (city) => `Iz ORY do ${city}: Orlyval + RER B ali tram T7 + metro (~35–50 min).`,
    en: (city) => `From ORY to ${city}: Orlyval + RER B, or tram T7 + metro (~35–50 min).`,
    de: (city) => `Von ORY nach ${city}: Orlyval + RER B oder Tram T7 + Metro (~35–50 Min.).`,
  },
  LHR: {
    sl: (city) => `Iz LHR do ${city}: Elizabeth line (~35–45 min) ali Piccadilly. Heathrow Express je hitrejši in dražji.`,
    en: (city) => `From LHR to ${city}: Elizabeth line (~35–45 min) or Piccadilly. Heathrow Express is faster and pricier.`,
    de: (city) => `Von LHR nach ${city}: Elizabeth Line (~35–45 Min.) oder Piccadilly.`,
  },
  BKK: {
    sl: (city, _i, price) =>
      `Iz BKK do ${city}: Airport Rail Link + BTS (~45–70 min) ali Grab (${price}). Izogibaj se neoznačenim taksijem pred terminalom.`,
    en: (city, _i, price) =>
      `From BKK to ${city}: Airport Rail Link + BTS (~45–70 min) or Grab (${price}). Skip unmarked curb taxis.`,
    de: (city, _i, price) =>
      `Von BKK nach ${city}: Airport Rail Link + BTS (~45–70 Min.) oder Grab (${price}).`,
  },
  NRT: {
    sl: (city) => `Iz NRT do ${city}: Narita Express ali Keisei Skyliner (~45–60 min). Suica/Pasmo za nadaljevanje z JR/metrojem.`,
    en: (city) => `From NRT to ${city}: Narita Express or Keisei Skyliner (~45–60 min). Suica/Pasmo for JR/metro after.`,
    de: (city) => `Von NRT nach ${city}: Narita Express oder Keisei Skyliner (~45–60 Min.).`,
  },
  HND: {
    sl: (city) => `Iz HND do ${city}: Tokyo Monorail ali Keikyu (~20–40 min). Suica/Pasmo na vratih.`,
    en: (city) => `From HND to ${city}: Tokyo Monorail or Keikyu (~20–40 min). Tap Suica/Pasmo.`,
    de: (city) => `Von HND nach ${city}: Tokyo Monorail oder Keikyu (~20–40 Min.).`,
  },
  FCO: {
    sl: (city) => `Iz FCO do ${city}: Leonardo Express do Termini (~32 min) ali regionalni vlak. Taxi ima fiksno ceno v center.`,
    en: (city) => `From FCO to ${city}: Leonardo Express to Termini (~32 min) or a regional train. Taxis use a fixed fare downtown.`,
    de: (city) => `Von FCO nach ${city}: Leonardo Express nach Termini (~32 Min.) oder Regionalzug.`,
  },
  AMS: {
    sl: (city) => `Iz AMS do ${city}: vlak do Amsterdam Centraal (~15–20 min), OV-chipkaart ali bankovna kartica.`,
    en: (city) => `From AMS to ${city}: train to Amsterdam Centraal (~15–20 min). OV-chip or contactless.`,
    de: (city) => `Von AMS nach ${city}: Zug nach Amsterdam Centraal (~15–20 Min.).`,
  },
  MUC: {
    sl: (city) => `Iz MUC do ${city}: S-Bahn S1 ali S8 do Hauptbahnhof (~40 min). MVV vozovnica velja na vlaku.`,
    en: (city) => `From MUC to ${city}: S-Bahn S1 or S8 to Hauptbahnhof (~40 min). MVV ticket covers the train.`,
    de: (city) => `Von MUC nach ${city}: S-Bahn S1 oder S8 zum Hauptbahnhof (~40 Min.).`,
  },
  SIN: {
    sl: (city) => `Iz SIN do ${city}: MRT (East-West) ~30–45 min ali taxi. SimplyGo / kartica na vratih.`,
    en: (city) => `From SIN to ${city}: MRT (East-West) ~30–45 min or a taxi. SimplyGo / contactless at the gates.`,
    de: (city) => `Von SIN nach ${city}: MRT (East-West) ~30–45 Min. oder Taxi.`,
  },
  DXB: {
    sl: (city, _i, price) =>
      `Iz DXB do ${city}: Metro Red Line (~45–60 min) ali taxi/Careem (${price}). Terminal 3 ima postajo metra.`,
    en: (city, _i, price) =>
      `From DXB to ${city}: Metro Red Line (~45–60 min) or taxi/Careem (${price}). Terminal 3 has a metro station.`,
    de: (city, _i, price) =>
      `Von DXB nach ${city}: Metro Red Line (~45–60 Min.) oder Taxi/Careem (${price}).`,
  },
};

export function airportTransferDescription(
  city: string,
  locale: TripLocale,
  dep: string,
  leaveHours: number,
): string {
  const modes = locale.transferLabel;
  const leaveLabel =
    locale.langCode === "sl" || locale.langCode.startsWith("sl")
      ? formatSlHours(leaveHours)
      : `${leaveHours}`;
  return planLangCopy(locale.langCode, {
    sl: `Let odhaja ob ${dep}. Na mednarodne lete odidi iz hotela približno ${leaveLabel} prej (promet + varnostna kontrola). Rezerviraj ${modes} z rezervo časa.`,
    // Avoid the phrase "return flight" here — activityTime treats that as an air leg clock range.
    en: `Flight departs at ${dep}. Leave the hotel about ${leaveHours} hours early (traffic + security). Pre-book ${modes} with buffer time.`,
    de: `Abflug um ${dep}. Etwa ${leaveHours} Stunden früher aus dem Hotel starten. ${modes} mit Zeitpuffer vorbuchen.`,
    it: `Il volo parte alle ${dep}. Lascia l'hotel circa ${leaveHours} ore prima (traffico + controlli). Prenota ${modes} con margine.`,
    es: `El vuelo sale a las ${dep}. Sal del hotel unas ${leaveHours} horas antes (tráfico + seguridad). Reserva ${modes} con margen.`,
    fr: `Le vol part à ${dep}. Quittez l'hôtel environ ${leaveHours} heures avant (trafic + contrôles). Réservez ${modes} avec marge.`,
  });
}

const WRITING_RULES: Record<PlanLang, string> = {
  sl: "KRITIČNO: Vsi naslovi, opisi in imena dni SAMO v slovenščini. Nikoli ne mešaj angleščine in slovenščine v istem naslovu ali stavku. Prepovedano: \"Departure from…\", \"Lunch stop en route\", \"Hike to the summit\", \"Morning Game Drive\". Piši npr. \"Odhod iz Mežice\", \"Kosilo na poti\", \"Pohod na vrh\". Dovoljene izjeme: uradna imena krajev/znamenitosti in kode letališč (npr. CDG).",
  en: "CRITICAL: All text in English only. Never mix languages or provide dual translations in the same field. Proper nouns and airport codes may stay as-is.",
  de: "KRITISCH: Gesamter Text nur auf Deutsch. Niemals Sprachen mischen oder Doppelübersetzungen im selben Feld. Eigennamen und Flughafencodes unverändert.",
};

export function languageWritingRule(langCode: string): string {
  const code = normalizePlanLangCode(langCode);
  return WRITING_RULES[code];
}
