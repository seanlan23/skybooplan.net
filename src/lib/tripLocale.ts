import { lookupDestination } from "@/lib/destinationCoords";

export type TripLocale = {
  langCode: string;
  slo: boolean;
  country: string;
  countryName: string;
  destinationIata: string;
  /** User-facing price unit — Slovenian trips use € only. */
  priceUnit: "EUR" | "LOCAL";
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
  TH: "budget",
  VN: "budget",
  PH: "budget",
  ID: "budget",
  MY: "budget",
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
    modes: { sl: "Uber, Lyft, taxi, javni prevoz", en: "Uber, Lyft, taxi, public transit" },
  },
  CA: {
    label: { sl: "Uber / taxi / javni prevoz", en: "Uber / taxi / transit" },
    modes: {
      sl: "Uber, taxi, TTC/TransLink, ni Graba",
      en: "Uber, taxi, TTC/TransLink — no Grab in Canada",
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

function inferCountry(destinationIata: string, destinationName: string): string {
  const meta = lookupDestination(destinationIata);
  if (meta?.country) return meta.country;
  return "XX";
}

function eurPrices(country: string, slo: boolean): { transfer: string; meal: string; massage: string } {
  if (!slo) {
    return { transfer: "varies", meal: "varies", massage: "varies" };
  }
  const tier = TIER_BY_COUNTRY[country] ?? "mid";
  return EUR_BANDS[tier];
}

export function getPriceTier(country: string): PriceTier {
  return TIER_BY_COUNTRY[country] ?? "mid";
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
): TripLocale {
  const slo = langCode === "sl" || langCode.startsWith("sl");
  const country = inferCountry(destinationIata, destinationName);
  const names = COUNTRY_NAMES[country] ?? COUNTRY_NAMES.XX;
  const transport = TRANSPORT_BY_COUNTRY[country] ?? DEFAULT_TRANSPORT;
  const eur = eurPrices(country, slo);

  return {
    langCode,
    slo,
    country,
    countryName: slo ? names.sl : names.en,
    destinationIata: destinationIata.toUpperCase(),
    priceUnit: slo ? "EUR" : "LOCAL",
    transferPrice: eur.transfer,
    mealPrice: eur.meal,
    massagePrice: eur.massage,
    transferLabel: slo ? transport.label.sl : transport.label.en,
    localTransportModes: slo ? transport.modes.sl : transport.modes.en,
  };
}

export function airportArrivalHint(city: string, locale: TripLocale): string {
  const slo = locale.slo;
  const hub = lookupDestination(locale.destinationIata);
  const c = city.toLowerCase();

  if (hub && (!city || c.includes(hub.name.toLowerCase().split(" ")[0] ?? ""))) {
    return slo
      ? `Preveri letališče na vstopnici — prihod je na ${locale.destinationIata} (${hub.name}).`
      : `Check your ticket — you arrive at ${locale.destinationIata} (${hub.name}).`;
  }

  if (locale.country === "TH" && /bangkok/.test(c)) {
    return slo
      ? "Preveri na vstopnici: BKK (Suvarnabhumi) ali DMK (Don Mueang)."
      : "Check ticket: BKK (Suvarnabhumi) or DMK (Don Mueang).";
  }
  if (locale.country === "VN" && /ho chi minh|saigon/.test(c)) {
    return slo
      ? "Preveri letališče: SGN (Tan Son Nhat)."
      : "Check your ticket: SGN (Tan Son Nhat).";
  }

  return slo
    ? "Preveri kodo letališča in terminal na letalski vstopnici pred izhodom."
    : "Check airport code and terminal on your ticket before leaving arrivals.";
}

export function hotelTransferDescription(city: string, locale: TripLocale): string {
  const slo = locale.slo;
  const modes = locale.transferLabel;
  if (slo) {
    return `Iz letališča do hotela v ${city} uporabi ${modes} — v večini mest je na voljo tudi prevozna aplikacija ali uradni taxi. Do centra računaj 20–90 min, odvisno od prometa in razdalje.`;
  }
  return `From the airport to your hotel in ${city}, use ${modes}. Allow 20–90 minutes depending on traffic.`;
}

export function airportTransferDescription(
  city: string,
  locale: TripLocale,
  dep: string,
  leaveHours: number,
): string {
  const slo = locale.slo;
  const modes = locale.transferLabel;
  if (slo) {
    return `Let odhaja ob ${dep}. Na mednarodne lete odidi iz hotela približno ${leaveHours} uri prej (promet + varnostna kontrola). Rezerviraj ${modes} z rezervo časa.`;
  }
  return `Return flight at ${dep}. Leave about ${leaveHours} hours early. Pre-book ${modes} with buffer time.`;
}

export function languageWritingRule(langCode: string): string {
  if (langCode === "sl" || langCode.startsWith("sl")) {
    return "KRITIČNO: Ves tekst SAMO v slovenščini. Brez angleških stavkov. Dovoljene izjeme: lastna imena krajev/znamenitosti in kode letališč (npr. CDG). Cene SAMO v € (npr. 15–30 €), nikoli lokalne valute v besedilu.";
  }
  if (langCode === "en") {
    return "All text in English. Prices in local currency with € equivalent where helpful.";
  }
  return `All text in language code ${langCode}. Use consistent currency per destination country.`;
}
