import { resolveDayBudgetCountry } from "@/lib/countryDailyBudget";
import { lookupDestination } from "@/lib/destinationCoords";
import type { StayFilterFlags } from "@/lib/hotelAmenities";

/**
 * How meals work at a typical beach resort — country-level, not a named-city branch.
 * `breakfast_first`: SE-Asia street-food / B&B culture.
 * `all_inclusive_standard`: wristband / buffet resort culture.
 */
export type ResortDiningModel = "breakfast_first" | "all_inclusive_standard" | "unspecified";

const BREAKFAST_FIRST_COUNTRIES = new Set(["TH", "ID", "VN", "LK", "PH"]);

const ALL_INCLUSIVE_COUNTRIES = new Set([
  "DO",
  "MX",
  "JM",
  "CU",
  "BS",
  "BB",
  "HT",
  "PR",
  "BZ",
  "AW",
  "CW",
  "TC",
  "AG",
  "LC",
  "GD",
  "KN",
  "VC",
  "TT",
  "KY",
  "VI",
  "SX",
  "MV",
  "EG",
  "TR",
  "MU",
]);

export type ResortDiningHint = {
  destinationIata?: string;
  destinationName?: string;
  destinationPlace?: string;
  destinationCountry?: string;
};

function diningCountry(hint: ResortDiningHint): string {
  const iata = (hint.destinationIata ?? "").toUpperCase();
  const fromIata = iata ? lookupDestination(iata)?.country : undefined;
  return resolveDayBudgetCountry({
    destinationCountry: hint.destinationCountry || fromIata,
    destinationName: [hint.destinationPlace, hint.destinationName].filter(Boolean).join(" "),
    destinationIata: iata,
  });
}

export function resolveResortDiningModel(hint: ResortDiningHint): ResortDiningModel {
  const cc = diningCountry(hint);
  if (BREAKFAST_FIRST_COUNTRIES.has(cc)) return "breakfast_first";
  if (ALL_INCLUSIVE_COUNTRIES.has(cc)) return "all_inclusive_standard";
  return "unspecified";
}

export function prefersAllInclusiveResortSearch(model: ResortDiningModel): boolean {
  return model === "all_inclusive_standard";
}

/** Booking search for Resort / Mir — 3–5★ hotel/resort/villa, 8.0+, pool. */
export const RESORT_STAY_QUALITY_FILTERS: StayFilterFlags = {
  hotel: true,
  resortStay: true,
  stars345: true,
  minReview80: true,
  pool: true,
};

export function defaultResortHotelFilters(model: ResortDiningModel): StayFilterFlags {
  if (model === "breakfast_first") return { ...RESORT_STAY_QUALITY_FILTERS, breakfast: true };
  if (model === "all_inclusive_standard") {
    return { ...RESORT_STAY_QUALITY_FILTERS, allInclusive: true };
  }
  return { ...RESORT_STAY_QUALITY_FILTERS };
}

export function resortHotelSearchFilters(
  model: ResortDiningModel,
  mix?: { minStars?: number } | null,
): StayFilterFlags {
  const base = defaultResortHotelFilters(model);
  if ((mix?.minStars ?? 3) >= 4) return { ...base, stars45: true };
  return base;
}

export function resortStayQualityFilters(mix?: { minStars?: number } | null): StayFilterFlags {
  if ((mix?.minStars ?? 3) >= 4) return { ...RESORT_STAY_QUALITY_FILTERS, stars45: true };
  return RESORT_STAY_QUALITY_FILTERS;
}

/** Tight → loose Booking filters when the first wave returns too few live stays. */
export function resortHotelSearchAttempts(
  model: ResortDiningModel,
  mix?: { minStars?: number } | null,
): StayFilterFlags[] {
  const tight = resortHotelSearchFilters(model, mix);
  const quality = resortStayQualityFilters(mix);
  const mid: StayFilterFlags = {
    hotel: true,
    resortStay: true,
    stars345: true,
    minReview80: true,
  };
  const loose: StayFilterFlags = {
    hotel: true,
    resortStay: true,
    minReview80: true,
  };
  const open: StayFilterFlags = {
    hotel: true,
    minReview80: true,
  };
  if (prefersAllInclusiveResortSearch(model)) {
    return [tight, quality, mid, loose, open];
  }
  return [tight, mid, loose, open];
}

/** Prompt + UI copy. Named places are examples for the model, not code branches. */
export function resortDiningPromptRules(model: ResortDiningModel, destLabel: string): string {
  const dest = destLabel.trim() || "this destination";
  if (model === "breakfast_first") {
    return `=== RESORT DINING (breakfast_first) ===
Destinacija: ${dest}.
STROGO PREPOVEDANO v resort_guide (in kjerkoli v JSON):
- trditi, da je All-Inclusive, polpenzion, full board ali "vse vključeno" tukaj STANDARD;
- zapestnice, formalne AI večerje, dress-code za AI restavracije, "all-inclusive bonton".
Privzeto poudari NOČITEV Z ZAJTRKOM (Bed & Breakfast).
Polje all_inclusive_etiquette uporabi za KULINARIKO IN PREHRANO (ne za AI bonton).
OBVEZNO v tem polju v jeziku uporabnika povej to idejo (primer SL):
"Na Tajskem / v Aziji je standard nočitev z zajtrkom, saj je lokalna kulinarična ponudba (restavracije ob plaži, nočne tržnice, lokalna hrana) izjemno ugodna, sveža in dostopna na vsakem koraku."
Če je destinacija Tajska, začni z "Na Tajskem"; sicer "V tej azijski destinaciji" / "In this Asian destination".
Primeri za razumevanje (NE if-veja): Tajska, Bali/Indonezija, Vietnam, Šrilanka, Filipini.`;
  }
  if (model === "all_inclusive_standard") {
    return `=== RESORT DINING (all_inclusive_standard) ===
Destinacija: ${dest}.
All-Inclusive JE prevladujoč model. V all_inclusive_etiquette opiši zapestnice, bufete, à-la-carte restavracije, dress code in formalne večerje.
Ne trdi, da je standard samo zajtrk.
Primeri za razumevanje (NE if-veja): Karibi (Dominikanska republika, Mehika/Cancun), Maldivi, Egipt, Turčija, Mavricij.`;
  }
  return `=== RESORT DINING (unspecified) ===
Destinacija: ${dest}.
Ne predpostavljaj All-Inclusive. Če nisi prepričan, opiši nočitev z zajtrkom in lokalne restavracije.
Zapestnice / AI bonton samo če je to res prevladujoč model na lokaciji.`;
}

export function resortDiningFieldSpec(model: ResortDiningModel): string {
  if (model === "breakfast_first") {
    return "kulinarika in prehrana: nočitev z zajtrkom je standard; lokalne restavracije in tržnice; BREZ zapestnic in AI";
  }
  if (model === "all_inclusive_standard") {
    return "all-inclusive bonton (zapestnice, restavracije à la carte, dress code, formalne večerje)";
  }
  return "prehrana v resortu — samo dejanski lokalni standard, ne izmišljuj All-Inclusive";
}

export function resortDiningSectionLabel(model: ResortDiningModel, lang: string): string {
  if (model === "breakfast_first") {
    return lang === "sl"
      ? "Kulinarika & prehrana v resortu (Nočitev z zajtrkom)"
      : "Resort dining (bed & breakfast)";
  }
  if (model === "all_inclusive_standard") {
    return lang === "sl"
      ? "All-inclusive bonton & restavracije"
      : "All-inclusive etiquette & restaurants";
  }
  return lang === "sl" ? "Kulinarika in prehrana" : "Dining at the resort";
}
