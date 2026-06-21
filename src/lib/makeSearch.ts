import type { HeroChatAttachmentPayload } from "@/lib/heroChatAttachment";
import { parseHeroChatAttachment } from "@/lib/heroChatAttachment";
import { extractHeroChatDates } from "@/lib/heroChatDates";

export type MakeSearchFlight = {
  id: string;
  destinacija: string;
  cena_eur: number;
  odhod: string;
  prevoznik: string;
  postanki: string;
  ai_povzetek: string;
  badge?: string;
  booking_url?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(/[^\d.,-]/g, "").replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function formatPostanki(record: Record<string, unknown>): string {
  const raw = record.postanki ?? record.stops ?? record.stop_count;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw === 0) return "0";
    return String(raw);
  }
  return "";
}

function extractFlightArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  if (!record) return [];

  for (const key of ["offers", "flights", "results", "data", "items", "body", "output"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }

  if (
    readString(record, "destinacija", "destination", "destination_iata") ||
    readString(record, "prevoznik", "carrier", "airline", "airline_name")
  ) {
    return [record];
  }

  return [];
}

function formatDepartureDatetime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatMakeRoute(origin: string, destination: string): string {
  if (origin && destination) return `${origin} → ${destination}`;
  return destination || origin || "—";
}

function parseFlightItem(item: unknown, index: number): MakeSearchFlight | null {
  const record = asRecord(item);
  if (!record) return null;

  const originIata = readString(record, "origin_iata", "origin").toUpperCase();
  const destIata = readString(record, "destination_iata", "destination_iata", "destination").toUpperCase();
  const destinacija =
    readString(record, "destinacija", "destination", "dest") ||
    formatMakeRoute(originIata, destIata);
  const prevoznik = readString(record, "prevoznik", "carrier", "airline", "airline_name");
  const departureIso = readString(record, "departure_datetime", "departure", "depart_datetime");
  const odhod =
    readString(record, "odhod", "departure", "depart") ||
    (departureIso ? formatDepartureDatetime(departureIso) : "");
  const badge = readString(record, "badge", "rank_label") || undefined;
  const ai_povzetek =
    readString(record, "ai_povzetek", "summary", "ai_summary", "povzetek") || badge || "";

  if (!destinacija && !prevoznik && !odhod) return null;

  const booking_url = readString(record, "booking_url", "url", "link", "rezervacija_url") || undefined;
  const rank = readString(record, "rank", "id");
  const priceCurrency = readString(record, "price_currency", "currency").toUpperCase();
  const priceTotal = readNumber(record, "price_total", "cena_eur", "price_eur", "price", "cena");
  const cena_eur =
    priceCurrency && priceCurrency !== "EUR" && priceTotal > 0
      ? priceTotal
      : readNumber(record, "cena_eur", "price_eur", "price_total", "price", "cena");

  const stopsRaw =
    record.stops_outbound ?? record.stops ?? record.stop_count ?? record.postanki;

  return {
    id: rank || readString(record, "id") || `flight-${index}`,
    destinacija: destinacija || "—",
    cena_eur,
    odhod: odhod || "—",
    prevoznik: prevoznik || "—",
    postanki: formatPostanki({ ...record, postanki: stopsRaw }),
    ai_povzetek,
    badge,
    booking_url,
  };
}

export function parseMakeSearchFlights(data: unknown): MakeSearchFlight[] {
  return extractFlightArray(data)
    .map((item, index) => parseFlightItem(item, index))
    .filter((item): item is MakeSearchFlight => item != null);
}

export type SearchRequestBody = {
  query: string;
  attachment?: HeroChatAttachmentPayload;
  latitude?: number;
  longitude?: number;
};

export type MakeSearchPassengers = {
  adults: number;
  children: number;
};

export type MakeSearchParsedData = {
  origin_airports: string[];
  destination_airport: string | null;
  departure_date: string;
  return_date: string;
  passengers: MakeSearchPassengers;
};

export type MakeSearchWebhookBody = {
  userMessage: string;
  latitude?: number;
  longitude?: number;
  searchId?: string;
  parsedData?: MakeSearchParsedData;
  attachment?: HeroChatAttachmentPayload;
};

export const MAKE_SEARCH_POLL_INTERVAL_MS = 2_500;
export const MAKE_SEARCH_POLL_MAX_ATTEMPTS = 18;

export function createMakeSearchId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `search-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const NEAREST_AIRPORT_LIMIT = 3;
const NEAREST_AIRPORT_LOOKUP_TIMEOUT_MS = 6_000;
const IATAGEO_FANOUT_KM = 150;
const DEFAULT_TRIP_DAYS = 14;

const MONTH_PATTERN =
  "januar|februar|marec|april|maj|junij|julij|avgust|september|oktober|november|december|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|avg|aug|sep|okt|oct|nov|dec";

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  januar: 0,
  january: 0,
  feb: 1,
  februar: 1,
  february: 1,
  mar: 2,
  marec: 2,
  march: 2,
  apr: 3,
  april: 3,
  maj: 4,
  may: 4,
  jun: 5,
  junij: 5,
  june: 5,
  jul: 6,
  julij: 6,
  july: 6,
  avg: 7,
  avgust: 7,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  okt: 9,
  oktober: 9,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/** Region/city aliases → primary international airport (more specific patterns first). */
const DESTINATION_ALIASES: Array<{ pattern: RegExp; iata: string }> = [
  { pattern: /\bbarcelon[ao]\b|\bbcn\b/i, iata: "BCN" },
  { pattern: /\bdubrovnik\b|\bdbv\b/i, iata: "DBV" },
  { pattern: /\bsplit\b|\bspu\b/i, iata: "SPU" },
  { pattern: /\bcancun\b|\bcancún\b|\bplaya\b/i, iata: "CUN" },
  { pattern: /\bho chi minh\b|\bsaigon\b|\bsgn\b/i, iata: "SGN" },
  { pattern: /\bhong kong\b|\bhkg\b/i, iata: "HKG" },
  { pattern: /\bnew york\b|\bnyc\b|\bmanhattan\b|\bjfk\b/i, iata: "JFK" },
  { pattern: /\blos angeles\b|\bla\b|\blax\b/i, iata: "LAX" },
  { pattern: /\bsan francisco\b|\bsfo\b/i, iata: "SFO" },
  { pattern: /\bphuket\b|\bhkt\b/i, iata: "HKT" },
  { pattern: /\bkuala lumpur\b|\bkul\b/i, iata: "KUL" },
  { pattern: /\bcape town\b|\bcpt\b/i, iata: "CPT" },
  { pattern: /\bho chi minh city\b/i, iata: "SGN" },
  { pattern: /\btajsk[ao]\b|\bthailand\b|\bbangkok\b|\bbkk\b/i, iata: "BKK" },
  { pattern: /\bbali\b|\bdps\b/i, iata: "DPS" },
  { pattern: /\bjaponsk[ao]\b|\bjapan\b|\btokyo\b|\bnrt\b|\bhnd\b/i, iata: "NRT" },
  { pattern: /\bosak[ao]\b|\bkix\b/i, iata: "KIX" },
  { pattern: /\bseoul\b|\bicn\b|\bkorej[ao]\b|\bkorea\b/i, iata: "ICN" },
  { pattern: /\bmehik[ao]\b|\bmexico\b|\bmex\b/i, iata: "MEX" },
  { pattern: /\bpariz\b|\bparis\b|\bcdg\b|\bory\b/i, iata: "CDG" },
  { pattern: /\blondon\b|\blhr\b|\blgw\b/i, iata: "LHR" },
  { pattern: /\brome\b|\broma\b|\bfco\b/i, iata: "FCO" },
  { pattern: /\bmilan\b|\bmilano\b|\bmxp\b/i, iata: "MXP" },
  { pattern: /\bamsterdam\b|\bams\b/i, iata: "AMS" },
  { pattern: /\bdubai\b|\bdxb\b/i, iata: "DXB" },
  { pattern: /\bsingapore\b|\bsin\b/i, iata: "SIN" },
  { pattern: /\bsydney\b|\bsyd\b|\bavstralij[ao]\b|\baustralia\b/i, iata: "SYD" },
  { pattern: /\bmiami\b|\bmia\b/i, iata: "MIA" },
  { pattern: /\bistanbul\b|\bist\b/i, iata: "IST" },
  { pattern: /\blisbon\b|\blisabon\b|\blis\b/i, iata: "LIS" },
  { pattern: /\bvienna\b|\bdunaj\b|\bvie\b/i, iata: "VIE" },
  { pattern: /\bmunich\b|\bmünchen\b|\bmunchen\b|\bmuc\b/i, iata: "MUC" },
  { pattern: /\bfrankfurt\b|\bfra\b/i, iata: "FRA" },
  { pattern: /\bzurich\b|\bzürich\b|\bzrh\b/i, iata: "ZRH" },
  { pattern: /\bathens\b|\bate\b|\bath\b/i, iata: "ATH" },
  { pattern: /\bdublin\b|\bdub\b/i, iata: "DUB" },
  { pattern: /\bcopenhagen\b|\bcph\b/i, iata: "CPH" },
  { pattern: /\bstockholm\b|\barn\b/i, iata: "ARN" },
  { pattern: /\boslo\b|\bosl\b/i, iata: "OSL" },
  { pattern: /\bhelsinki\b|\bhel\b/i, iata: "HEL" },
  { pattern: /\bprague\b|\bpraga\b|\bprg\b/i, iata: "PRG" },
  { pattern: /\bwarsaw\b|\bvaršava\b|\bwaw\b/i, iata: "WAW" },
  { pattern: /\bbudapest\b|\bbud\b/i, iata: "BUD" },
  { pattern: /\bcairo\b|\bcai\b|\begipt\b|\begypt\b/i, iata: "CAI" },
  { pattern: /\bmarrakech\b|\brak\b|\bmaroko\b|\bmorocco\b/i, iata: "RAK" },
  { pattern: /\bjakarta\b|\bcgk\b/i, iata: "CGK" },
  { pattern: /\bmanila\b|\bmnl\b|\bfilipin[ei]\b|\bphilippines\b/i, iata: "MNL" },
  { pattern: /\bhanoi\b|\bhan\b|\bvietnam\b/i, iata: "HAN" },
  { pattern: /\bda nang\b|\bdad\b/i, iata: "DAD" },
  { pattern: /\briodejaneiro\b|\brio de janeiro\b|\brio\b|\bgig\b/i, iata: "GIG" },
  { pattern: /\bbuenos aires\b|\beze\b/i, iata: "EZE" },
  { pattern: /\blima\b|\blim\b/i, iata: "LIM" },
  { pattern: /\bbogota\b|\bbogotá\b|\bbog\b/i, iata: "BOG" },
  { pattern: /\bhrvašk[ao]\b|\bcroatia\b|\bhrvatsk[ao]\b/i, iata: "SPU" },
  { pattern: /\bšpanij[ao]\b|\bspan\b|\bspain\b|\bmadrid\b|\bmad\b/i, iata: "MAD" },
  { pattern: /\bitalij[ao]\b|\bitaly\b/i, iata: "FCO" },
  { pattern: /\bgrčij[ao]\b|\bgreece\b/i, iata: "ATH" },
  { pattern: /\bturčij[ao]\b|\bturkey\b/i, iata: "IST" },
  { pattern: /\bindonezij[ao]\b|\bindonesia\b/i, iata: "DPS" },
  { pattern: /\bmaldiv[ei]\b|\bmle\b/i, iata: "MLE" },
  { pattern: /\breykjavik\b|\biceland\b|\bisland\b|\bkef\b/i, iata: "KEF" },
  { pattern: /\bberlin\b|\bber\b/i, iata: "BER" },
  { pattern: /\bchicago\b|\bord\b/i, iata: "ORD" },
  { pattern: /\blas vegas\b|\blas\b/i, iata: "LAS" },
  { pattern: /\bhonolulu\b|\bhawaii\b|\bhnl\b/i, iata: "HNL" },
  { pattern: /\bdoha\b|\bdoh\b/i, iata: "DOH" },
  { pattern: /\btel aviv\b|\btlv\b/i, iata: "TLV" },
  { pattern: /\bchiang mai\b|\bcnx\b/i, iata: "CNX" },
  { pattern: /\bkrabi\b|\bkbv\b/i, iata: "KBV" },
  { pattern: /\bzanzibar\b|\bznz\b/i, iata: "ZNZ" },
];

type AirportCandidate = {
  iata: string;
  lat: number;
  lon: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function defaultDepartureDate(reference = new Date()): string {
  const d = new Date(reference);
  d.setUTCMonth(d.getUTCMonth() + 3);
  return d.toISOString().slice(0, 10);
}

function resolveMonthIndex(token: string): number | undefined {
  const key = token.toLowerCase().replace(/\./g, "");
  if (key in MONTH_INDEX) return MONTH_INDEX[key];
  const short = key.slice(0, 3);
  return MONTH_INDEX[short];
}

function inferYear(monthIndex: number, reference = new Date()): number {
  const year = reference.getFullYear();
  return monthIndex < reference.getMonth() ? year + 1 : year;
}

function clampPassengers(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function parseMakeSearchPassengers(text: string): MakeSearchPassengers {
  let adults = 1;
  let children = 0;

  const adultMatch = text.match(/(\d+)\s*(?:odras(?:el|la|li|lih)?|adults?|passenger|potnik)/i);
  if (adultMatch) {
    adults = Number.parseInt(adultMatch[1]!, 10);
  }

  const childMatch = text.match(/(\d+)\s*(?:otrok|otroka|otroci|children|child|infants?)/i);
  if (childMatch) {
    children = Number.parseInt(childMatch[1]!, 10);
  }

  return {
    adults: clampPassengers(adults, 1, 9),
    children: clampPassengers(children, 0, 8),
  };
}

export function parseMakeSearchDestination(text: string): string | null {
  const upper = text.toUpperCase();

  const arrowMatch = upper.match(/\b(?:→|->|DO|TO)\s*([A-Z]{3})\b/);
  if (arrowMatch && arrowMatch[1] !== "LJU") return arrowMatch[1]!;

  const explicitIata = upper.match(/\b(?:DESTINACIJ[AO]|DESTINATION|V|TO|IN)\s+([A-Z]{3})\b/);
  if (explicitIata) return explicitIata[1]!;

  for (const alias of DESTINATION_ALIASES) {
    if (alias.pattern.test(text)) return alias.iata;
  }

  const looseIata = upper.match(/\b([A-Z]{3})\b/g);
  if (looseIata) {
    const skip = new Set(["LJU", "ZAG", "VIE", "VCE", "LET", "AND", "THE", "FOR"]);
    const found = looseIata.find((code) => !skip.has(code));
    if (found) return found;
  }

  return null;
}

export function parseMakeSearchDates(
  text: string,
  reference = new Date(),
): { departure_date: string; return_date: string } {
  const extracted = extractHeroChatDates(text, "sl");

  if (extracted.departDate) {
    const departure_date = extracted.departDate;
    const return_date = extracted.returnDate ?? addDays(departure_date, DEFAULT_TRIP_DAYS);
    return { departure_date, return_date };
  }

  const lower = text.toLowerCase();

  const endMonth = lower.match(new RegExp(`konec\\s+(${MONTH_PATTERN})`, "i"));
  if (endMonth) {
    const monthIndex = resolveMonthIndex(endMonth[1]!);
    if (monthIndex != null) {
      const year = inferYear(monthIndex, reference);
      const departure_date = toIsoDate(year, monthIndex, 26);
      return { departure_date, return_date: addDays(departure_date, DEFAULT_TRIP_DAYS) };
    }
  }

  const startMonth = lower.match(new RegExp(`(?:začetek|zacetek|start\\s+of)\\s+(${MONTH_PATTERN})`, "i"));
  if (startMonth) {
    const monthIndex = resolveMonthIndex(startMonth[1]!);
    if (monthIndex != null) {
      const year = inferYear(monthIndex, reference);
      const departure_date = toIsoDate(year, monthIndex, 5);
      return { departure_date, return_date: addDays(departure_date, DEFAULT_TRIP_DAYS) };
    }
  }

  const monthOnly = lower.match(new RegExp(`\\b(${MONTH_PATTERN})\\b`, "i"));
  if (monthOnly && extracted.precision === "vague") {
    const monthIndex = resolveMonthIndex(monthOnly[1]!);
    if (monthIndex != null) {
      const year = inferYear(monthIndex, reference);
      const departure_date = toIsoDate(year, monthIndex, 15);
      return { departure_date, return_date: addDays(departure_date, DEFAULT_TRIP_DAYS) };
    }
  }

  const departure_date = defaultDepartureDate(reference);
  return { departure_date, return_date: addDays(departure_date, DEFAULT_TRIP_DAYS) };
}

/** Parse natural-language hero search text into structured Make.com flight fields. */
export function parseMakeSearchUserMessage(
  userMessage: string,
  originAirports: string[] = [],
): MakeSearchParsedData {
  const text = userMessage.trim();
  const { departure_date, return_date } = parseMakeSearchDates(text);
  const passengers = parseMakeSearchPassengers(text);
  const destination_airport = parseMakeSearchDestination(text);

  const origin_airports = originAirports
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{3}$/.test(code))
    .slice(0, NEAREST_AIRPORT_LIMIT);

  return {
    origin_airports,
    destination_airport,
    departure_date,
    return_date,
    passengers,
  };
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function offsetLatLng(lat: number, lon: number, bearingDeg: number, distanceM: number): [number, number] {
  const br = (bearingDeg * Math.PI) / 180;
  const d = distanceM / 6_371_000;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

function readIataCode(record: Record<string, unknown>): string {
  const raw = readString(
    record,
    "iata",
    "iataCode",
    "iata_code",
    "IATA",
    "code",
  ).toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : "";
}


async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseGetCodeAirport(data: unknown): { iata: string; lat?: number; lon?: number } | null {
  const record = asRecord(data);
  if (!record) return null;
  const iata = readIataCode(record);
  if (!iata) return null;
  const latRaw = record.latitude ?? record.lat;
  const lonRaw = record.longitude ?? record.lon ?? record.lng;
  const lat = typeof latRaw === "number" ? latRaw : Number.parseFloat(String(latRaw));
  const lon = typeof lonRaw === "number" ? lonRaw : Number.parseFloat(String(lonRaw));
  return {
    iata,
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
  };
}

async function fetchIatageoAirportCoords(iata: string): Promise<{ lat: number; lon: number } | null> {
  const data = await fetchJsonWithTimeout(
    `https://iatageo.com/v2/airports/iata/${iata}`,
    NEAREST_AIRPORT_LOOKUP_TIMEOUT_MS,
  );
  const root = asRecord(data);
  if (!root || root.success === false) return null;
  const record = asRecord(root.data) ?? root;
  const coords = asRecord(record.coordinates);
  const latRaw = coords?.latitude ?? record.latitude ?? record.lat;
  const lonRaw = coords?.longitude ?? record.longitude ?? record.lon ?? record.lng;
  const lat = typeof latRaw === "number" ? latRaw : Number.parseFloat(String(latRaw));
  const lon = typeof lonRaw === "number" ? lonRaw : Number.parseFloat(String(lonRaw));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function fetchGetCodeAirport(latitude: number, longitude: number) {
  const data = await fetchJsonWithTimeout(
    `https://iatageo.com/getCode/${latitude}/${longitude}`,
    NEAREST_AIRPORT_LOOKUP_TIMEOUT_MS,
  );
  return parseGetCodeAirport(data);
}

function rankNearestAirports(
  originLat: number,
  originLon: number,
  candidates: AirportCandidate[],
  limit: number,
): string[] {
  const byIata = new Map<string, number>();
  for (const candidate of candidates) {
    const distanceM = haversineMeters(originLat, originLon, candidate.lat, candidate.lon);
    const existing = byIata.get(candidate.iata);
    if (existing == null || distanceM < existing) {
      byIata.set(candidate.iata, distanceM);
    }
  }
  return [...byIata.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([iata]) => iata);
}

async function enrichAirportCandidates(
  latitude: number,
  longitude: number,
  codes: string[],
): Promise<AirportCandidate[]> {
  const enriched = await Promise.all(
    codes.map(async (iata) => {
      const coords = await fetchIatageoAirportCoords(iata);
      if (coords) return { iata, lat: coords.lat, lon: coords.lon };
      return { iata, lat: latitude, lon: longitude };
    }),
  );
  return enriched;
}

/** Resolve up to 3 nearest major international airports via IATAGeo getCode. */
export async function fetchNearestAirports(
  latitude: number,
  longitude: number,
  limit = NEAREST_AIRPORT_LIMIT,
): Promise<string[]> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

  const offsetM = IATAGEO_FANOUT_KM * 1_000;
  const searchPoints: Array<[number, number]> = [
    [latitude, longitude],
    ...([0, 90, 180, 270] as const).map((bearing) => offsetLatLng(latitude, longitude, bearing, offsetM)),
  ];

  const found = await Promise.all(
    searchPoints.map(([lat, lon]) => fetchGetCodeAirport(lat, lon)),
  );

  const uniqueCodes = [...new Set(found.filter((item) => item != null).map((item) => item!.iata))];
  if (uniqueCodes.length === 0) return [];

  const candidates = await enrichAirportCandidates(latitude, longitude, uniqueCodes);
  return rankNearestAirports(latitude, longitude, candidates, limit);
}

export function parseSearchRequestBody(body: unknown): SearchRequestBody | null {
  const record = asRecord(body);
  if (!record) return null;
  const query = record.query;
  if (typeof query !== "string" || !query.trim()) return null;

  let attachment: HeroChatAttachmentPayload | undefined;
  if (record.attachment != null) {
    const parsed = parseHeroChatAttachment(record.attachment);
    if (!parsed) return null;
    attachment = parsed;
  }

  let latitude: number | undefined;
  let longitude: number | undefined;

  const latRaw = record.latitude;
  const lonRaw = record.longitude;
  if (latRaw != null && lonRaw != null) {
    const lat = typeof latRaw === "number" ? latRaw : Number.parseFloat(String(latRaw));
    const lon = typeof lonRaw === "number" ? lonRaw : Number.parseFloat(String(lonRaw));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      latitude = lat;
      longitude = lon;
    }
  }

  return {
    query: query.trim(),
    attachment,
    latitude,
    longitude,
  };
}

export type MakeWebhookParseResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; raw: string };

export const MAKE_WEBHOOK_ASYNC_CODE = "MAKE_WEBHOOK_ASYNC";

function isAsyncAckText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === "accepted" || normalized === "ok";
}

/**
 * Make.com instant webhooks often return plain text "Accepted" (HTTP 200/202)
 * when the scenario runs asynchronously instead of returning JSON results.
 * Fix in Make: Webhook → "Immediately as data arrives" + Webhook response module.
 */
export function parseMakeWebhookBody(text: string, httpStatus: number): MakeWebhookParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: true, data: {} };
  }

  if (httpStatus === 202 || isAsyncAckText(trimmed)) {
    return {
      ok: true,
      data: buildMakeAsyncPayload(trimmed || "Accepted"),
    };
  }

  try {
    return { ok: true, data: JSON.parse(trimmed) as unknown };
  } catch {
    if (httpStatus >= 200 && httpStatus < 300) {
      return {
        ok: true,
        data: buildMakeAsyncPayload(trimmed),
      };
    }
    return {
      ok: false,
      error: "Make webhook je vrnil neveljaven JSON.",
      raw: trimmed.slice(0, 500),
    };
  }
}

export function buildMakeAsyncPayload(message: string): Record<string, unknown> {
  return {
    accepted: true,
    async: true,
    code: MAKE_WEBHOOK_ASYNC_CODE,
    message,
    flights: [],
    hint:
      "Make.com webhook must run synchronously: set trigger to “Immediately as data arrives” and add a Webhook response module that returns JSON.",
  };
}

export function isMakeAsyncAccepted(data: unknown): boolean {
  const record = asRecord(data);
  if (!record) return false;
  if (parseMakeSearchFlights(data).length > 0) return false;
  if (record.code === MAKE_WEBHOOK_ASYNC_CODE) return true;
  if (record.async === true) return true;
  return (
    record.accepted === true &&
    !Array.isArray(record.flights) &&
    !Array.isArray(record.offers)
  );
}

export function extractMakeSearchId(data: unknown): string | null {
  const record = asRecord(data);
  if (!record) return null;
  const id = readString(record, "searchId", "search_id", "key", "id");
  return id || null;
}

function tryParseJsonString(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

/** Unwrap Make Data Store / Gemini payloads where offers may be a JSON string. */
export function unwrapMakeSearchOffersPayload(data: unknown): unknown {
  if (parseMakeSearchFlights(data).length > 0) return data;

  const record = asRecord(data);
  if (!record) return data;

  const offersRaw = record.offers ?? record.Offers;
  if (typeof offersRaw === "string") {
    const parsed = tryParseJsonString(offersRaw);
    if (parsed != null) {
      return Array.isArray(parsed) ? { offers: parsed } : parsed;
    }
  }

  for (const key of ["value", "data", "record", "body", "output"]) {
    const nested = record[key];
    if (nested == null) continue;
    const unwrapped = unwrapMakeSearchOffersPayload(nested);
    if (parseMakeSearchFlights(unwrapped).length > 0) return unwrapped;
  }

  return data;
}

export type MakeSearchStatusResult =
  | { status: "ready"; flights: MakeSearchFlight[]; raw: unknown }
  | { status: "pending"; flights: MakeSearchFlight[]; raw: unknown }
  | { status: "error"; flights: MakeSearchFlight[]; error: string; raw: unknown };

export function parseMakeSearchStatus(data: unknown): MakeSearchStatusResult {
  const payload = unwrapMakeSearchOffersPayload(data);
  const flights = parseMakeSearchFlights(payload);
  if (flights.length > 0) {
    return { status: "ready", flights, raw: data };
  }

  const record = asRecord(data);
  const errorMessage = record
    ? readString(record, "error", "message", "detail")
    : "";
  if (record?.status === "error" || errorMessage) {
    return {
      status: "error",
      flights: [],
      error: errorMessage || "Iskanje letov ni uspelo.",
      raw: data,
    };
  }

  return { status: "pending", flights: [], raw: data };
}

export async function callMakeSearchStatusWebhook(
  searchId: string,
  options?: { timeoutMs?: number },
): Promise<
  | { ok: true; data: unknown; httpStatus: number }
  | { ok: false; error: string; status: number }
> {
  const url = process.env.MAKE_STATUS_WEBHOOK_URL?.trim();
  if (!url) {
    return {
      ok: false,
      error: "MAKE_STATUS_WEBHOOK_URL ni nastavljen.",
      status: 503,
    };
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 12_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchId }),
      signal: controller.signal,
    });

    const text = await res.text();
    const parsed = parseMakeWebhookBody(text, res.status);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, status: 502 };
    }

    if (!res.ok) {
      return { ok: false, error: "Status webhook ni vrnil uspešnega odgovora.", status: res.status };
    }

    return { ok: true, data: parsed.data, httpStatus: res.status };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Status webhook je potekel (timeout).", status: 504 };
    }
    const message = err instanceof Error ? err.message : "Status webhook klic ni uspel.";
    return { ok: false, error: message, status: 502 };
  } finally {
    clearTimeout(timeout);
  }
}

export async function callMakeSearchWebhook(
  body: MakeSearchWebhookBody,
  options?: { timeoutMs?: number },
): Promise<
  | { ok: true; data: unknown; httpStatus: number; searchId: string }
  | { ok: false; error: string; status: number }
> {
  const url = process.env.MAKE_WEBHOOK_URL?.trim();
  if (!url) {
    return { ok: false, error: "MAKE_WEBHOOK_URL ni nastavljen.", status: 503 };
  }

  const searchId = body.searchId?.trim() || createMakeSearchId();

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 28_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const payload: Record<string, unknown> = {
      userMessage: body.userMessage,
      searchId,
    };

    if (body.latitude != null && Number.isFinite(body.latitude)) {
      payload.latitude = body.latitude;
    }
    if (body.longitude != null && Number.isFinite(body.longitude)) {
      payload.longitude = body.longitude;
    }

    const hasCoords =
      body.latitude != null &&
      body.longitude != null &&
      Number.isFinite(body.latitude) &&
      Number.isFinite(body.longitude);

    let parsedData = body.parsedData;
    if (!parsedData) {
      const originAirports =
        hasCoords ? await fetchNearestAirports(body.latitude!, body.longitude!) : [];
      parsedData = parseMakeSearchUserMessage(body.userMessage, originAirports);
    }
    payload.parsedData = parsedData;

    if (body.attachment) {
      payload.attachment = body.attachment;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await res.text();
    const parsed = parseMakeWebhookBody(text, res.status);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error, status: 502 };
    }

    if (!res.ok) {
      return { ok: false, error: "Make webhook ni vrnil uspešnega odgovora.", status: res.status };
    }

    return { ok: true, data: parsed.data, httpStatus: res.status, searchId };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Make webhook je potekel (timeout).", status: 504 };
    }
    const message = err instanceof Error ? err.message : "Make webhook klic ni uspel.";
    return { ok: false, error: message, status: 502 };
  } finally {
    clearTimeout(timeout);
  }
}
