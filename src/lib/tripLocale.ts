import { lookupDestination } from "@/lib/destinationCoords";
import { formatSlHours } from "@/lib/flightScheduling";
import { planLangCopy } from "@/lib/planLangCopy";
import { normalizePlanLangCode, type PlanLang } from "@/lib/planLanguages";
import {
  formatPlanMoneyRange,
  normalizePlanCurrency,
  type PlanCurrency,
} from "@/lib/planCurrency";

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
  return null;
}

function inferCountry(destinationIata: string, destinationName: string): string {
  const meta = lookupDestination(destinationIata);
  if (meta?.country) return meta.country;
  return inferCountryFromName(destinationName) ?? "XX";
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
  displayCurrency: PlanCurrency = "EUR",
): TripLocale {
  const code = normalizePlanLangCode(langCode);
  const slo = code === "sl";
  const currency = normalizePlanCurrency(displayCurrency);
  const country = inferCountry(destinationIata, destinationName);
  const names = COUNTRY_NAMES[country] ?? COUNTRY_NAMES.XX;
  const transport = TRANSPORT_BY_COUNTRY[country] ?? DEFAULT_TRANSPORT;
  const bands = tierPriceBands(country, currency);

  return {
    langCode: code,
    slo,
    country,
    countryName: slo ? names.sl : names.en,
    destinationIata: destinationIata.toUpperCase(),
    displayCurrency: currency,
    transferPrice: bands.transfer,
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
  const modes = locale.transferLabel;
  const price = locale.transferPrice;
  return planLangCopy(locale.langCode, {
    sl: `Iz letališča do hotela v ${city} uporabi ${modes} (orientacijsko ${price}) — v večini mest je na voljo tudi prevozna aplikacija ali uradni taxi. Do centra računaj 20–90 min, odvisno od prometa in razdalje.`,
    en: `From the airport to your hotel in ${city}, use ${modes} (about ${price}). Allow 20–90 minutes depending on traffic.`,
    de: `Vom Flughafen zum Hotel in ${city} mit ${modes} (ca. ${price}). Plane 20–90 Minuten je nach Verkehr ein.`,
    it: `Dall'aeroporto all'hotel a ${city} usa ${modes} (circa ${price}). Conta 20–90 minuti a seconda del traffico.`,
    es: `Del aeropuerto al hotel en ${city} usa ${modes} (aprox. ${price}). Reserva 20–90 minutos según el tráfico.`,
    fr: `De l'aéroport à l'hôtel à ${city}, utilisez ${modes} (env. ${price}). Prévoyez 20–90 minutes selon le trafic.`,
  });
}

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
    en: `Return flight at ${dep}. Leave about ${leaveHours} hours early. Pre-book ${modes} with buffer time.`,
    de: `Rückflug um ${dep}. Etwa ${leaveHours} Stunden früher aus dem Hotel starten. ${modes} mit Zeitpuffer vorbuchen.`,
  });
}

const WRITING_RULES: Record<PlanLang, string> = {
  sl: "KRITIČNO: Ves tekst SAMO v slovenščini — tudi naslovi aktivnosti, opisi, travelHack, transportationTips. Prepovedano: angleški naslovi tipa \"Departure from…\", \"Lunch stop en route\", \"Drive to…\". Piši npr. \"Odhod iz Mežice\", \"Kosilo na poti\", \"Vožnja proti Gardskemu jezeru\". Nikoli ne mešaj jezikov v istem bloku. Dovoljene izjeme: uradna imena krajev/znamenitosti in kode letališč (npr. CDG).",
  en: "CRITICAL: All text in English only. Never mix languages or provide dual translations in the same field. Proper nouns and airport codes may stay as-is.",
  es: "CRÍTICO: Todo el texto solo en español. Nunca mezcles idiomas ni ofrezcas traducciones duales en el mismo campo. Nombres propios y códigos de aeropuerto pueden quedar como están.",
  fr: "CRITIQUE : Tout le texte uniquement en français. Ne mélangez jamais les langues ni ne fournissez de double traduction dans le même champ. Noms propres et codes aéroport inchangés.",
  it: "CRITICO: Tutto il testo solo in italiano. Non mescolare mai le lingue né fornire doppie traduzioni nello stesso campo. Nomi propri e codici aeroporto invariati.",
  de: "KRITISCH: Gesamter Text nur auf Deutsch. Niemals Sprachen mischen oder Doppelübersetzungen im selben Feld. Eigennamen und Flughafencodes unverändert.",
};

export function languageWritingRule(langCode: string): string {
  const code = normalizePlanLangCode(langCode);
  return WRITING_RULES[code];
}
