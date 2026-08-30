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
  applyHeroTripHints,
  callMakeSearchStatusWebhook,
  callMakeSearchWebhook,
  createMakeSearchId,
  extractMakeSearchId,
  fetchNearestAirports,
  isMakeAsyncAccepted,
  MAX_MULTI_ORIGIN_SEARCHES,
  mergeAndRankMakeSearchFlights,
  parseMakeSearchFlights,
  parseMakeSearchStatus,
  parseMakeSearchUserMessage,
  selectTopMakeSearchFlights,
  tagMakeSearchFlightsWithOrigin,
  unwrapMakeSearchOffersPayload,
  type HeroTripSearchHints,
  type MakeSearchFlight,
  type MakeSearchParsedData,
} from "@/lib/makeSearch";

/** Hero search including Make.com scenario runtime (Duffel loop + Gemini can take 60s+). */
export const HERO_SEARCH_TIMEOUT_MS = 120_000;

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
  trip_type: z.enum(["oneway", "return", "openjaw"]).optional(),
  return_from_iata: z
    .union([z.string().regex(/^[A-Z]{3}$/), z.null()])
    .optional(),
});

export type ParsedHeroQuery = z.infer<typeof ParsedQuerySchema>;

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

function formatFallbackDeparture(flight: DuffelFlight): string {
  const leg = flight.outbound;
  return `${leg.date}, ${leg.depart}`;
}

/** Map a Duffel offer into the hero/Make card shape (return leg + airline IATA for logos). */
export function duffelFlightToMakeSearchFlight(
  flight: DuffelFlight,
  destinationName?: string,
  aiSummary = "",
  opts?: { travelers?: number },
): MakeSearchFlight {
  const out = flight.outbound;
  const inn = flight.inbound;
  const formatLegStops = (leg: typeof out) => {
    if (leg.stops <= 0) return "0";
    const via = leg.via || leg.layovers?.map((l) => l.iata).filter(Boolean).join(",");
    return via ? `${leg.stops}|${via}` : String(leg.stops);
  };
  const postanki = inn ? `${formatLegStops(out)}/${formatLegStops(inn)}` : formatLegStops(out);
  const airlineIata = (flight.airlineCode || out.airlineCode || "").toUpperCase();
  // Duffel total_amount is always the party total for the searched passengers.
  const travelers = Math.max(1, opts?.travelers ?? 1);

  return {
    id: flight.id,
    destinacija: destinationName ?? out.to,
    cena_eur: flight.price,
    price_basis: "party_total",
    travelers,
    odhod: formatFallbackDeparture(flight),
    ...(inn
      ? {
          povratek: `${inn.date}, ${inn.depart}`,
          return_date: inn.date,
          inbound_depart: inn.depart,
          inbound_arrive: inn.arrive,
          inbound_arrive_day_offset: inn.arriveDayOffset || undefined,
          inbound_duration: inn.duration,
          inbound_origin_iata: inn.from,
          inbound_destination_iata: inn.to,
        }
      : {}),
    prevoznik: flight.airline || out.airline,
    ...(airlineIata ? { airline_iata: airlineIata } : {}),
    postanki,
    ai_povzetek: aiSummary,
    origin_iata: out.from,
    destination_iata: out.to,
    depart_date: out.date,
    outbound_depart: out.depart,
    outbound_arrive: out.arrive,
    outbound_arrive_day_offset: out.arriveDayOffset || undefined,
    outbound_duration: out.duration,
    duration_minutes: flight.durationMin,
    ...(out.layovers?.length ? { outbound_layovers: out.layovers } : {}),
    ...(inn?.layovers?.length ? { inbound_layovers: inn.layovers } : {}),
  };
}

/**
 * Deterministic top-3 by price + travel-time penalty (same as Make merge/rank).
 * No LLM ranking on the direct Duffel path.
 */
export function rankDuffelOffersForHero(
  flights: DuffelFlight[],
  destinationName?: string,
  travelers = 1,
): MakeSearchFlight[] {
  if (flights.length === 0) return [];
  const mapped = flights.map((f) =>
    duffelFlightToMakeSearchFlight(f, destinationName, "", { travelers }),
  );
  return selectTopMakeSearchFlights(mapped);
}

export type HeroFlightSearchLocation = {
  latitude: number;
  longitude: number;
};

export type HeroFlightSearchResult =
  | { ok: true; flights: MakeSearchFlight[]; parsed: ParsedHeroQuery; makeResponse?: unknown }
  | {
      ok: true;
      pending: true;
      searchId: string;
      /** Parallel Make searches (one per origin). */
      searchIds?: string[];
      origins?: string[];
      /** Sync offers already returned while other origins still pending. */
      seedFlights?: MakeSearchFlight[];
    }
  | { ok: false; error: string; status: number };

/**
 * Opt-in: route hero search through Make.com first.
 * Default is direct Duffel (avoids Make queue / 429 storms).
 * Set MAKE_FLIGHT_SEARCH_PRIMARY=1 only when intentionally testing Make.
 */
export function isMakeFlightSearchPrimary(): boolean {
  const v = process.env.MAKE_FLIGHT_SEARCH_PRIMARY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When Make is primary but returns an error or empty offers, fall back to Duffel once. */
export function shouldFallbackFromMakeToDuffel(result: HeroFlightSearchResult): boolean {
  if (!result.ok) return true;
  if ("pending" in result && result.pending) return false;
  if ("flights" in result && Array.isArray(result.flights) && result.flights.length > 0) {
    return false;
  }
  return true;
}

function stubParsedFromMake(parsed: MakeSearchParsedData): ParsedHeroQuery {
  const tripType = parsed.trip_type ?? "return";
  return {
    origin_iata: parsed.origin_airport || "LJU",
    destination_iata: parsed.destination_airport || "LJU",
    depart_date: parsed.departure_date || defaultDateFrom(),
    return_date:
      tripType === "oneway"
        ? null
        : parsed.return_date || defaultDateTo(defaultDateFrom()),
    adults: parsed.passengers.adults,
    children: parsed.passengers.children,
    trip_type: tripType === "openjaw" ? "openjaw" : tripType === "oneway" ? "oneway" : "return",
    return_from_iata: parsed.return_from_airport || null,
  };
}

async function searchSingleOriginViaMake(
  query: string,
  parsedData: MakeSearchParsedData,
  attachment: HeroChatAttachmentPayload | undefined,
  location: HeroFlightSearchLocation | undefined,
): Promise<HeroFlightSearchResult> {
  const searchId = createMakeSearchId();
  const webhook = await callMakeSearchWebhook(
    {
      userMessage: query,
      searchId,
      latitude: location?.latitude,
      longitude: location?.longitude,
      attachment,
      parsedData,
    },
    { timeoutMs: 100_000 },
  );

  if (!webhook.ok) {
    return { ok: false, error: webhook.error, status: webhook.status };
  }

  const syncFlights = parseMakeSearchFlights(unwrapMakeSearchOffersPayload(webhook.data));
  if (syncFlights.length > 0) {
    return {
      ok: true,
      flights: syncFlights,
      parsed: stubParsedFromMake(parsedData),
      makeResponse: webhook.data,
    };
  }

  const resolvedSearchId = extractMakeSearchId(webhook.data) ?? webhook.searchId;
  const statusUrlConfigured = Boolean(process.env.MAKE_STATUS_WEBHOOK_URL?.trim());

  if (statusUrlConfigured && resolvedSearchId) {
    return {
      ok: true,
      pending: true,
      searchId: resolvedSearchId,
      searchIds: [resolvedSearchId],
      origins: [parsedData.origin_airport],
    };
  }

  if (isMakeAsyncAccepted(webhook.data)) {
    return {
      ok: false,
      error: "heroSearch.makeStatusMissing",
      status: 502,
    };
  }

  return {
    ok: true,
    flights: [],
    parsed: stubParsedFromMake(parsedData),
    makeResponse: webhook.data,
  };
}

async function searchViaMakeWebhook(
  query: string,
  attachment?: HeroChatAttachmentPayload,
  location?: HeroFlightSearchLocation,
  tripHints?: HeroTripSearchHints,
): Promise<HeroFlightSearchResult> {
  const geoOrigins =
    location != null
      ? await fetchNearestAirports(location.latitude, location.longitude)
      : [];
  const baseParsed = applyHeroTripHints(
    parseMakeSearchUserMessage(query, geoOrigins),
    tripHints,
  );
  const dest = baseParsed.destination_airport?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(dest)) {
    return { ok: false, error: "heroSearch.destinationUnclear", status: 422 };
  }

  const origins = baseParsed.origin_airports
    .map((o) => o.trim().toUpperCase())
    .filter((o) => /^[A-Z]{3}$/.test(o) && o !== dest)
    .slice(0, MAX_MULTI_ORIGIN_SEARCHES);

  const uniqueOrigins = [
    ...new Set(
      (origins.length > 0 ? origins : [baseParsed.origin_airport])
        .map((o) => o.trim().toUpperCase())
        .filter((o) => /^[A-Z]{3}$/.test(o) && o !== dest),
    ),
  ];

  if (uniqueOrigins.length === 0) {
    return { ok: false, error: "heroSearch.originSameAsDestination", status: 422 };
  }

  if (uniqueOrigins.length <= 1) {
    const origin = uniqueOrigins[0]!;
    return searchSingleOriginViaMake(
      query,
      {
        ...baseParsed,
        destination_airport: dest,
        origin_airport: origin,
        origin_airports: [origin],
      },
      attachment,
      location,
    );
  }

  const statusUrlConfigured = Boolean(process.env.MAKE_STATUS_WEBHOOK_URL?.trim());
  console.log("[heroFlightSearch] Multi-origin Make fan-out:", uniqueOrigins.join(", "));

  const started = await Promise.all(
    uniqueOrigins.map(async (origin) => {
      const searchId = createMakeSearchId();
      const webhook = await callMakeSearchWebhook(
        {
          userMessage: query,
          searchId,
          latitude: location?.latitude,
          longitude: location?.longitude,
          attachment,
          parsedData: {
            ...baseParsed,
            destination_airport: dest,
            origin_airport: origin,
            origin_airports: [origin],
          },
        },
        { timeoutMs: 35_000 },
      );

      if (!webhook.ok) {
        return {
          origin,
          searchId,
          ok: false as const,
          error: webhook.error,
          flights: [] as MakeSearchFlight[],
        };
      }

      const syncFlights = tagMakeSearchFlightsWithOrigin(
        parseMakeSearchFlights(unwrapMakeSearchOffersPayload(webhook.data), {
          rank: false,
        }),
        origin,
      );
      return {
        origin,
        searchId: extractMakeSearchId(webhook.data) ?? webhook.searchId,
        ok: true as const,
        flights: syncFlights,
      };
    }),
  );

  const successful = started.filter((s) => s.ok);
  const seedFlights = started.flatMap((s) => s.flights);
  const syncFlights = mergeAndRankMakeSearchFlights(seedFlights, { showOriginBadge: true });

  // Every origin returned offers synchronously — done.
  const allSync =
    successful.length > 0 &&
    successful.every((s) => s.flights.length > 0) &&
    successful.length === started.length;
  if (allSync) {
    return {
      ok: true,
      flights: syncFlights,
      parsed: stubParsedFromMake({
        ...baseParsed,
        destination_airport: dest,
        origin_airport: uniqueOrigins[0]!,
        origin_airports: uniqueOrigins,
      }),
      makeResponse: { flights: syncFlights, origins: uniqueOrigins },
    };
  }

  // Poll origins that have no sync offers yet; keep seed flights from the rest.
  const pollEntries = successful.filter((s) => s.flights.length === 0 && s.searchId);
  const pollIds = pollEntries.map((s) => s.searchId);
  const pollOrigins = pollEntries.map((s) => s.origin);

  if (statusUrlConfigured && pollIds.length > 0) {
    return {
      ok: true,
      pending: true,
      searchId: pollIds[0]!,
      searchIds: pollIds,
      origins: pollOrigins,
      // Cap payload size for the client poll merge.
      seedFlights: seedFlights.slice(0, 40),
    };
  }

  // No status webhook — return whatever sync offers we got.
  if (syncFlights.length > 0) {
    return {
      ok: true,
      flights: syncFlights,
      parsed: stubParsedFromMake({
        ...baseParsed,
        destination_airport: dest,
        origin_airport: uniqueOrigins[0]!,
        origin_airports: uniqueOrigins,
      }),
      makeResponse: { flights: syncFlights, origins: uniqueOrigins },
    };
  }

  if (successful.length > 0) {
    return {
      ok: false,
      error: "heroSearch.makeStatusMissing",
      status: 502,
    };
  }

  const firstError = started.find((s) => !s.ok);
  return {
    ok: false,
    error: firstError && !firstError.ok ? firstError.error : "heroSearch.error",
    status: 502,
  };
}

/** Poll Make.com Data Store once for async flight search results. */
export async function checkHeroFlightSearchStatus(
  searchId: string,
  opts?: { rank?: boolean },
): Promise<
  | { ok: true; status: "ready"; flights: MakeSearchFlight[]; makeResponse: unknown }
  | { ok: true; status: "pending" }
  | { ok: false; error: string; status: number }
> {
  const trimmed = searchId.trim();
  if (!trimmed) {
    return { ok: false, error: "Manjka searchId.", status: 400 };
  }

  const webhook = await callMakeSearchStatusWebhook(trimmed, { timeoutMs: 12_000 });
  if (!webhook.ok) {
    return { ok: false, error: webhook.error, status: webhook.status };
  }

  const payload = unwrapMakeSearchOffersPayload(webhook.data);
  const unranked = parseMakeSearchFlights(payload, { rank: false });
  if (unranked.length > 0) {
    const flights =
      opts?.rank === false
        ? unranked
        : mergeAndRankMakeSearchFlights(unranked, { showOriginBadge: false });
    return {
      ok: true,
      status: "ready",
      flights,
      makeResponse: payload,
    };
  }

  const parsed = parseMakeSearchStatus(webhook.data);
  if (parsed.status === "ready") {
    return {
      ok: true,
      status: "ready",
      flights: parsed.flights,
      makeResponse: payload,
    };
  }

  if (parsed.status === "error") {
    return { ok: false, error: parsed.error, status: 502 };
  }

  return { ok: true, status: "pending" };
}

/** Poll several origin searches and merge into a global top 3. */
export async function checkHeroMultiOriginSearchStatus(
  searchIds: string[],
  opts?: { origins?: string[] },
): Promise<
  | { ok: true; status: "ready"; flights: MakeSearchFlight[] }
  | { ok: true; status: "pending"; readyOrigins: number; total: number }
  | { ok: false; error: string; status: number }
> {
  const ids = [...new Set(searchIds.map((id) => id.trim()).filter(Boolean))];
  const origins = (opts?.origins ?? []).map((o) => o.trim().toUpperCase());

  if (ids.length === 0) {
    return { ok: false, error: "Manjka searchId.", status: 400 };
  }

  if (ids.length === 1) {
    const single = await checkHeroFlightSearchStatus(ids[0]!);
    if (!single.ok) return single;
    if (single.status === "pending") {
      return { ok: true, status: "pending", readyOrigins: 0, total: 1 };
    }
    const tagged = tagMakeSearchFlightsWithOrigin(single.flights, origins[0] ?? "");
    return {
      ok: true,
      status: "ready",
      flights: mergeAndRankMakeSearchFlights(tagged, {
        showOriginBadge: Boolean(origins[0]),
      }),
    };
  }

  const results = await Promise.all(
    ids.map((id) => checkHeroFlightSearchStatus(id, { rank: false })),
  );

  let pendingCount = 0;
  let errorCount = 0;
  const collected: MakeSearchFlight[] = [];

  results.forEach((result, index) => {
    if (!result.ok) {
      errorCount += 1;
      return;
    }
    if (result.status === "pending") {
      pendingCount += 1;
      return;
    }
    const origin = origins[index] ?? "";
    collected.push(...tagMakeSearchFlightsWithOrigin(result.flights, origin));
  });

  if (pendingCount > 0) {
    return {
      ok: true,
      status: "pending",
      readyOrigins: ids.length - pendingCount - errorCount,
      total: ids.length,
    };
  }

  const merged = mergeAndRankMakeSearchFlights(collected, { showOriginBadge: true });
  if (merged.length === 0 && errorCount === ids.length) {
    return { ok: false, error: "heroSearch.error", status: 502 };
  }

  return { ok: true, status: "ready", flights: merged };
}

async function searchViaDirectDuffel(
  query: string,
  attachment?: HeroChatAttachmentPayload,
  tripHints?: HeroTripSearchHints,
): Promise<HeroFlightSearchResult> {
  const parsedResult = await parseQueryWithOpenAI(query, attachment);
  if ("error" in parsedResult) {
    return { ok: false, error: parsedResult.error, status: 502 };
  }
  let parsed = parsedResult;
  if (tripHints) {
    const hinted = applyHeroTripHints(
      {
        origin_airports: [parsed.origin_iata],
        origin_airport: parsed.origin_iata,
        destination_airport: parsed.destination_iata,
        departure_date: parsed.depart_date,
        return_date: parsed.return_date ?? "",
        passengers: { adults: parsed.adults, children: parsed.children ?? 0 },
        trip_type: parsed.trip_type,
        return_from_airport: parsed.return_from_iata,
      },
      tripHints,
    );
    parsed = {
      ...parsed,
      origin_iata: hinted.origin_airport,
      destination_iata: hinted.destination_airport || parsed.destination_iata,
      depart_date: hinted.departure_date,
      return_date: hinted.return_date || null,
      trip_type: hinted.trip_type,
      return_from_iata: hinted.return_from_airport || null,
      adults: hinted.passengers.adults,
      children: hinted.passengers.children,
    };
  }

  if (!getDuffelApiKey()) {
    return { ok: false, error: "heroSearch.error", status: 503 };
  }

  const adults = Math.min(9, Math.max(1, parsed.adults));
  const children = Math.min(8, Math.max(0, parsed.children ?? 0));
  const travelers = Math.min(9, adults + children);
  const tripType = parsed.trip_type ?? "return";
  const returnDate =
    tripType !== "oneway" && parsed.return_date ? parsed.return_date : undefined;

  const duffelResult = await searchDuffelOffers({
    origin: parsed.origin_iata,
    destination: parsed.destination_iata,
    departDate: parsed.depart_date,
    returnDate,
    returnFromIata: parsed.return_from_iata || undefined,
    tripType:
      tripType === "openjaw" ? "multicity" : tripType === "oneway" ? "oneway" : "return",
    pax: travelers,
    adults,
    children,
    supplierTimeoutMs: 12_000,
    maxOffers: 40,
  });

  if ("error" in duffelResult) {
    const message =
      duffelResult.error === "error.duffelNotConfigured"
        ? "DUFFEL_API_KEY ni nastavljen na strežniku."
        : "Leti trenutno niso na voljo. Poskusite z drugimi datumi ali destinacijo.";
    return { ok: false, error: message, status: 502 };
  }

  const flights = rankDuffelOffersForHero(
    duffelResult.flights,
    parsed.destination_name ?? parsed.destination_iata,
    travelers,
  );
  return { ok: true, flights, parsed };
}

async function runHeroFlightSearch(
  query: string,
  attachment?: HeroChatAttachmentPayload,
  location?: HeroFlightSearchLocation,
  tripHints?: HeroTripSearchHints,
): Promise<HeroFlightSearchResult> {
  // Default: direct Duffel. Make only when MAKE_FLIGHT_SEARCH_PRIMARY=1 (and webhook URL set).
  if (isMakeFlightSearchPrimary() && process.env.MAKE_WEBHOOK_URL?.trim()) {
    const makeResult = await searchViaMakeWebhook(query, attachment, location, tripHints);
    if (!shouldFallbackFromMakeToDuffel(makeResult)) {
      return makeResult;
    }
    console.warn(
      "[heroFlightSearch] Make primary failed or empty — falling back to direct Duffel",
    );
  }

  return searchViaDirectDuffel(query, attachment, tripHints);
}

/** Natural-language hero search: Duffel direct + value score (default), or opt-in Make. */
export async function searchHeroFlights(
  query: string,
  attachment?: HeroChatAttachmentPayload,
  location?: HeroFlightSearchLocation,
  tripHints?: HeroTripSearchHints,
): Promise<HeroFlightSearchResult> {
  try {
    return await withTimeout(
      runHeroFlightSearch(query, attachment, location, tripHints),
      HERO_SEARCH_TIMEOUT_MS,
      "hero-flight-search",
    );
  } catch (err) {
    if (err instanceof OperationTimeoutError) {
      return {
        ok: false,
        error: "Iskanje je trajalo predolgo (2 min). Poskusite znova z bolj specifičnim nizom.",
        status: 504,
      };
    }
    const message = err instanceof Error ? err.message : "Iskanje letov ni uspelo.";
    return { ok: false, error: message, status: 500 };
  }
}
