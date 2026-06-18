import { z } from "zod";
import { OperationTimeoutError, withTimeout } from "@/lib/asyncTimeout";
import type { HeroChatAttachmentPayload } from "@/lib/heroChatAttachment";
import { buildHeroAttachmentContext } from "@/lib/heroChatAttachment.server";
import {
  getDuffelApiKey,
  searchDuffelOffers,
  type DuffelFlight,
} from "@/lib/flights.functions";
import { generateJson } from "@/lib/llm";
import {
  callMakeSearchWebhook,
  isMakeAsyncAccepted,
  parseMakeSearchFlights,
  type MakeSearchFlight,
} from "@/lib/makeSearch";

export const HERO_SEARCH_TIMEOUT_MS = 30_000;

const ParsedQuerySchema = z.object({
  origin_iata: z.string().regex(/^[A-Z]{3}$/),
  destination_iata: z.string().regex(/^[A-Z]{3}$/),
  depart_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  return_date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(8).optional(),
  budget_eur: z.number().nullable().optional(),
  destination_name: z.string().optional(),
  trip_type: z.enum(["oneway", "return"]).optional(),
});

export type ParsedHeroQuery = z.infer<typeof ParsedQuerySchema>;

const RankedFlightSchema = z.object({
  offer_id: z.string(),
  destinacija: z.string(),
  cena_eur: z.number(),
  odhod: z.string(),
  prevoznik: z.string(),
  postanki: z.string(),
  ai_povzetek: z.string(),
});

const RankResponseSchema = z.object({
  flights: z.array(RankedFlightSchema).max(3),
});

const PARSE_SYSTEM = `You extract flight search parameters from natural-language travel queries.
Return ONE JSON object with these keys:
- origin_iata: 3-letter IATA airport code. If origin is not specified, use "LJU" (Ljubljana).
- destination_iata: 3-letter IATA for the main destination airport (required). NEVER return city or country names — always a valid IATA code.
- date_from: YYYY-MM-DD outbound departure date. Omit or null if the user did not specify any dates (server applies defaults).
- date_to: YYYY-MM-DD return date. Omit or null if the user did not specify any dates (server applies defaults).
- adults: integer 1-9 (default 1)
- children: integer 0-8 (default 0)
- budget_eur: number or null (total trip budget in EUR if mentioned)
- destination_name: human-readable destination for display only (e.g. "Pariz, Francija") — NOT used for search
- trip_type: "oneway" or "return"

DATE DEFAULTS (when user gives no dates — leave date_from and date_to null):
- date_from = 3 months from today
- date_to = date_from + 7 days

ORIGIN DEFAULT: If origin is not specified → "LJU" (Ljubljana).

CITY → IATA (always convert; never output city names in origin_iata or destination_iata):
Paris→CDG, London→LHR, NYC/New York→JFK, Tokyo→NRT, Bali→DPS, Bangkok→BKK, Barcelona→BCN,
Rome→FCO, Amsterdam→AMS, Dubai→DXB, Singapore→SIN, Sydney→SYD, Los Angeles→LAX, Miami→MIA,
Istanbul→IST, Lisbon→LIS, Vienna→VIE, Munich→MUC, Frankfurt→FRA, Zurich→ZRH, Athens→ATH,
Dublin→DUB, Copenhagen→CPH, Stockholm→ARN, Oslo→OSL, Helsinki→HEL, Prague→PRG, Warsaw→WAW,
Budapest→BUD, Cairo→CAI, Marrakech→RAK, Cape Town→CPT, Tokyo→NRT, Osaka→KIX, Seoul→ICN,
Hong Kong→HKG, Phuket→HKT, Kuala Lumpur→KUL, Jakarta→CGK, Manila→MNL, Hanoi→HAN, Ho Chi Minh→SGN,
Cancun→CUN, Mexico City→MEX, Buenos Aires→EZE, Rio→GIG, Lima→LIM, Bogota→BOG.

Use uppercase IATA codes only. Pick the primary international airport for each city.`;

const RANK_SYSTEM = `You are a travel assistant. From Duffel flight offers, pick the best 3 for the user's query.
Prefer good value, reasonable duration, and fewer stops. Respect budget_eur when provided.
Return JSON: { "flights": [ { "offer_id": "...", "destinacija": "...", "cena_eur": number, "odhod": "human-readable departure (date + time)", "prevoznik": "airline name", "postanki": "0" or "1" or "2+", "ai_povzetek": "1-2 sentence summary in the user's language" } ] }
Include at most 3 flights. Every offer_id must come from the input list.`;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Default outbound date when user omits dates: 3 months from today. */
export function defaultDateFrom(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 3);
  return d.toISOString().slice(0, 10);
}

/** Default return date: date_from + 7 days. */
export function defaultDateTo(dateFrom: string): string {
  return addDays(dateFrom, 7);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readStringField(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readIntField(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function readBudget(raw: Record<string, unknown>): number | null | undefined {
  const value = raw.budget_eur ?? raw.budget;
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.,-]/g, "").replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Coerce loosely typed OpenAI JSON into a validated search query. */
export function coerceParsedHeroQuery(raw: unknown): ParsedHeroQuery | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const originRaw = readStringField(record, "origin_iata", "origin", "from");
  const destRaw = readStringField(record, "destination_iata", "destination", "to");
  const origin = (originRaw || "LJU").toUpperCase().slice(0, 3);
  const destination = destRaw.toUpperCase().slice(0, 3);
  if (!/^[A-Z]{3}$/.test(destination)) return null;

  const dateFromRaw = readStringField(
    record,
    "date_from",
    "depart_date",
    "departure_date",
    "date",
  );
  const dateToRaw = readStringField(record, "date_to", "return_date", "returnDate");

  const hasExplicitFrom = isIsoDate(dateFromRaw);
  const hasExplicitTo = isIsoDate(dateToRaw);
  const datesOmitted = !hasExplicitFrom && !hasExplicitTo;

  const departDate = hasExplicitFrom ? dateFromRaw : defaultDateFrom();
  let returnDate: string | null = null;

  if (hasExplicitTo) {
    returnDate = dateToRaw;
  } else if (datesOmitted) {
    returnDate = defaultDateTo(departDate);
  }

  const adults = readIntField(record, "adults", "passengers", "pax") ?? 1;
  const children = readIntField(record, "children", "child_count") ?? 0;
  const tripTypeRaw = readStringField(record, "trip_type", "tripType").toLowerCase();
  const trip_type =
    tripTypeRaw === "oneway"
      ? ("oneway" as const)
      : tripTypeRaw === "return" || returnDate
        ? ("return" as const)
        : ("oneway" as const);

  const candidate = {
    origin_iata: /^[A-Z]{3}$/.test(origin) ? origin : "LJU",
    destination_iata: destination,
    depart_date: departDate,
    return_date: trip_type === "return" && returnDate ? returnDate : null,
    adults: Math.min(9, Math.max(1, adults)),
    children: Math.min(8, Math.max(0, children)),
    budget_eur: readBudget(record),
    destination_name: readStringField(record, "destination_name", "destination_label") || undefined,
    trip_type,
  };

  const parsed = ParsedQuerySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

async function parseQueryWithOpenAI(
  query: string,
  attachment?: HeroChatAttachmentPayload,
): Promise<ParsedHeroQuery | { error: string }> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { error: "OPENAI_API_KEY ni nastavljen na strežniku." };
  }

  let effectiveQuery = query;
  let images: { mimeType: string; base64: string }[] | undefined;

  if (attachment) {
    const ctx = await buildHeroAttachmentContext(attachment);
    effectiveQuery = `${query}${ctx.searchQuerySuffix}`.trim();
    if (attachment.kind === "image" && ctx.geminiImage) {
      images = [ctx.geminiImage];
      effectiveQuery = `${effectiveQuery}\n\nThe user also shared an image — use visual clues (destination, dates, mood) when inferring search parameters.`.trim();
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const result = await generateJson<unknown>({
    role: "skeleton",
    provider: "openai",
    model: "gpt-4o-mini",
    system: PARSE_SYSTEM,
    user: `Today's date: ${today}\n\nUser query:\n${effectiveQuery}`,
    images,
    maxTokens: 700,
    timeoutMs: 10_000,
    label: "hero-search/parse",
  });

  if (!result.data) {
    return { error: result.detail ?? "OpenAI ni razbral iskalnega niza." };
  }

  const parsed = coerceParsedHeroQuery(result.data);
  if (!parsed) {
    return { error: "OpenAI je vrnil neveljavne parametre iskanja." };
  }
  return parsed;
}

function summarizeOffersForRank(flights: DuffelFlight[]): unknown[] {
  return flights.slice(0, 15).map((f) => ({
    offer_id: f.id,
    price_eur: f.price,
    airline: f.airline,
    origin: f.outbound.from,
    destination: f.outbound.to,
    depart_date: f.outbound.date,
    depart_time: f.outbound.depart,
    arrive_time: f.outbound.arrive,
    duration: f.duration,
    stops: f.stops,
    return_leg: f.inbound
      ? {
          depart_date: f.inbound.date,
          depart_time: f.inbound.depart,
          arrive_time: f.inbound.arrive,
          stops: f.inbound.stops,
        }
      : null,
  }));
}

function formatFallbackDeparture(flight: DuffelFlight): string {
  const leg = flight.outbound;
  return `${leg.date}, ${leg.depart}`;
}

function mapDuffelToHeroFlight(
  flight: DuffelFlight,
  destinationName?: string,
  aiSummary = "",
): MakeSearchFlight {
  return {
    id: flight.id,
    destinacija: destinationName ?? flight.outbound.to,
    cena_eur: flight.price,
    odhod: formatFallbackDeparture(flight),
    prevoznik: flight.airline,
    postanki: flight.stops === 0 ? "0" : String(flight.stops),
    ai_povzetek: aiSummary,
  };
}

function fallbackTopFlights(
  flights: DuffelFlight[],
  parsed: ParsedHeroQuery,
): MakeSearchFlight[] {
  return flights.slice(0, 3).map((f) =>
    mapDuffelToHeroFlight(
      f,
      parsed.destination_name,
      f.stops === 0
        ? "Neposreden let — dobra cena."
        : `${f.stops} postanek(a) — ugoden let.`,
    ),
  );
}

async function rankFlightsWithOpenAI(
  query: string,
  parsed: ParsedHeroQuery,
  flights: DuffelFlight[],
): Promise<MakeSearchFlight[]> {
  if (flights.length === 0) return [];

  const summaries = summarizeOffersForRank(flights);
  const userPayload = JSON.stringify({
    user_query: query,
    budget_eur: parsed.budget_eur ?? null,
    destination_name: parsed.destination_name ?? parsed.destination_iata,
    offers: summaries,
  });

  const result = await generateJson<unknown>({
    role: "skeleton",
    provider: "openai",
    model: "gpt-4o-mini",
    system: RANK_SYSTEM,
    user: userPayload,
    maxTokens: 1200,
    timeoutMs: 10_000,
    label: "hero-search/rank",
  });

  if (!result.data) {
    return fallbackTopFlights(flights, parsed);
  }

  const ranked = RankResponseSchema.safeParse(result.data);
  if (!ranked.success || ranked.data.flights.length === 0) {
    return fallbackTopFlights(flights, parsed);
  }

  const byId = new Map(flights.map((f) => [f.id, f]));
  const output: MakeSearchFlight[] = [];

  for (const item of ranked.data.flights) {
    const source = byId.get(item.offer_id);
    output.push({
      id: item.offer_id,
      destinacija: item.destinacija || parsed.destination_name || parsed.destination_iata,
      cena_eur: item.cena_eur || source?.price || 0,
      odhod: item.odhod || (source ? formatFallbackDeparture(source) : "—"),
      prevoznik: item.prevoznik || source?.airline || "—",
      postanki: item.postanki || (source ? String(source.stops) : "—"),
      ai_povzetek: item.ai_povzetek,
    });
  }

  return output.slice(0, 3);
}

export type HeroFlightSearchLocation = {
  latitude: number;
  longitude: number;
};

export type HeroFlightSearchResult =
  | { ok: true; flights: MakeSearchFlight[]; parsed: ParsedHeroQuery; makeResponse?: unknown }
  | { ok: false; error: string; status: number };

async function searchViaMakeWebhook(
  query: string,
  attachment?: HeroChatAttachmentPayload,
  location?: HeroFlightSearchLocation,
): Promise<HeroFlightSearchResult> {
  const webhook = await callMakeSearchWebhook(
    {
      userMessage: query,
      latitude: location?.latitude,
      longitude: location?.longitude,
      attachment,
    },
    { timeoutMs: HERO_SEARCH_TIMEOUT_MS - 2_000 },
  );

  if (!webhook.ok) {
    return { ok: false, error: webhook.error, status: webhook.status };
  }

  if (isMakeAsyncAccepted(webhook.data)) {
    return {
      ok: false,
      error:
        "Make.com je sprejel zahtevo brez podatkov o letih. Nastavite sinhron webhook z odgovorom JSON.",
      status: 502,
    };
  }

  const flights = parseMakeSearchFlights(webhook.data);
  const stubParsed: ParsedHeroQuery = {
    origin_iata: "LJU",
    destination_iata: "LJU",
    depart_date: defaultDateFrom(),
    return_date: defaultDateTo(defaultDateFrom()),
    adults: 1,
    children: 0,
    trip_type: "return",
  };

  return { ok: true, flights, parsed: stubParsed, makeResponse: webhook.data };
}

async function runHeroFlightSearch(
  query: string,
  attachment?: HeroChatAttachmentPayload,
  location?: HeroFlightSearchLocation,
): Promise<HeroFlightSearchResult> {
  if (process.env.MAKE_WEBHOOK_URL?.trim()) {
    return searchViaMakeWebhook(query, attachment, location);
  }

  const parsedResult = await parseQueryWithOpenAI(query, attachment);
  if ("error" in parsedResult) {
    return { ok: false, error: parsedResult.error, status: 502 };
  }
  const parsed = parsedResult;

  if (!getDuffelApiKey()) {
    return { ok: false, error: "DUFFEL_API_KEY ni nastavljen na strežniku.", status: 503 };
  }

  const pax = Math.min(9, parsed.adults + (parsed.children ?? 0));
  const returnDate =
    parsed.trip_type === "return" && parsed.return_date ? parsed.return_date : undefined;

  const duffelResult = await searchDuffelOffers({
    origin: parsed.origin_iata,
    destination: parsed.destination_iata,
    departDate: parsed.depart_date,
    returnDate,
    pax,
    supplierTimeoutMs: 12_000,
    maxOffers: 20,
  });

  if ("error" in duffelResult) {
    const message =
      duffelResult.error === "error.duffelNotConfigured"
        ? "DUFFEL_API_KEY ni nastavljen na strežniku."
        : "Leti trenutno niso na voljo. Poskusite z drugimi datumi ali destinacijo.";
    return { ok: false, error: message, status: 502 };
  }

  const flights = await rankFlightsWithOpenAI(query, parsed, duffelResult.flights);
  return { ok: true, flights, parsed };
}

/** Natural-language hero search: Make.com webhook or OpenAI parse → Duffel offers → OpenAI top 3. */
export async function searchHeroFlights(
  query: string,
  attachment?: HeroChatAttachmentPayload,
  location?: HeroFlightSearchLocation,
): Promise<HeroFlightSearchResult> {
  try {
    return await withTimeout(
      runHeroFlightSearch(query, attachment, location),
      HERO_SEARCH_TIMEOUT_MS,
      "hero-flight-search",
    );
  } catch (err) {
    if (err instanceof OperationTimeoutError) {
      return {
        ok: false,
        error: "Iskanje je trajalo predolgo (30 s). Poskusite znova z bolj specifičnim nizom.",
        status: 504,
      };
    }
    const message = err instanceof Error ? err.message : "Iskanje letov ni uspelo.";
    return { ok: false, error: message, status: 500 };
  }
}
