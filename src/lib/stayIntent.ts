import { findStayCountryInText, matchStayCountry } from "@/lib/hotelDestinationPick";

export type StayIntentFilters = {
  cabin?: boolean;
  jacuzzi?: boolean;
  nature?: boolean;
  hotel?: boolean;
  apartment?: boolean;
};

export type StayIntent = {
  place: string;
  filters: StayIntentFilters;
};

const CABIN_RE =
  /\b(cabins?|cottages?|chalets?|lodges?|koč[ae]|koca|koce|hišic[ae]|hisic[ae]|vikend(?:ica)?|počitin\w*|pocitin\w*)\b/gi;
const JACUZZI_RE = /\b(jacuzz\w*|jakuzz\w*|hot\s*tubs?|whirlpool|masažn\w*\s+kad\w*|masazn\w*\s+kad\w*)\b/gi;
const NATURE_RE =
  /\b(nature|narav[ai]|countryside|rural|gozd(?:u|ovi)?|forest|mountains?|gor[ae]|alpe|alps)\b/gi;
const HOTEL_RE = /\b(hotels?|hoteli?)\b/gi;
const APARTMENT_RE = /\b(apartments?|apartma(?:ji)?|apartmajih|flats?|studios?)\b/gi;

const FILLER_RE =
  /\b(v|in|im|z|s|with|and|in|en|und|mit|a|the|za|za\s+dva|near|pri|ob)\b/gi;

function has(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}

function stripTokens(text: string, ...res: RegExp[]): string {
  let out = text;
  for (const re of res) {
    re.lastIndex = 0;
    out = out.replace(re, " ");
  }
  return out.replace(/[.,;:!?]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Pull a place + stay vibe out of free text ("koča v naravi z jacuzzijem, Slovenija"). */
export function parseStayIntent(text: string): StayIntent {
  const raw = text.replace(/\s+/g, " ").trim();
  if (!raw) return { place: "", filters: {} };

  const filters: StayIntentFilters = {};
  if (has(CABIN_RE, raw)) filters.cabin = true;
  if (has(JACUZZI_RE, raw)) filters.jacuzzi = true;
  if (has(NATURE_RE, raw)) filters.nature = true;
  if (has(HOTEL_RE, raw)) filters.hotel = true;
  if (has(APARTMENT_RE, raw)) filters.apartment = true;

  const mentioned = findStayCountryInText(raw);
  if (mentioned) {
    return { place: mentioned.english, filters };
  }

  const leftover = stripTokens(raw, CABIN_RE, JACUZZI_RE, NATURE_RE, HOTEL_RE, APARTMENT_RE, FILLER_RE);
  const leftoverCountry = matchStayCountry(leftover);
  if (leftoverCountry) {
    return { place: leftoverCountry.english, filters };
  }

  return { place: leftover, filters };
}

export function mergeStayFilters(
  ...parts: Array<StayIntentFilters | undefined>
): StayIntentFilters {
  const out: StayIntentFilters = {};
  for (const part of parts) {
    if (!part) continue;
    if (part.cabin) out.cabin = true;
    if (part.jacuzzi) out.jacuzzi = true;
    if (part.nature) out.nature = true;
    if (part.hotel) out.hotel = true;
    if (part.apartment) out.apartment = true;
  }
  return out;
}
