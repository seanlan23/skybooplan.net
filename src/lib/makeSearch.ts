import type { HeroChatAttachmentPayload } from "@/lib/heroChatAttachment";
import { parseHeroChatAttachment } from "@/lib/heroChatAttachment";
import { extractHeroChatDates } from "@/lib/heroChatDates";
import { originAliasPatterns } from "@/lib/airportCatalog";
import {
  elapsedMinutesBetweenAirportLocals,
  estimateLocalArrival,
  isoHasExplicitOffset,
} from "@/lib/airportTimeZones";
import { duffelSliceDurationMin } from "@/lib/flightSliceDuration";

export type MakeSearchFlight = {
  id: string;
  destinacija: string;
  cena_eur: number;
  /**
   * How `cena_eur` should be read in the UI.
   * Duffel offer totals are party totals; legacy Make cards are often per-adult.
   */
  price_basis?: "per_adult" | "party_total";
  /** Traveler count when `price_basis` is party_total (adults + children). */
  travelers?: number;
  odhod: string;
  /** Return-leg departure when the offer has a second Duffel slice. */
  povratek?: string;
  prevoznik: string;
  /** IATA airline code when available (for logo). */
  airline_iata?: string;
  /** e.g. EY85 — helps external search match the card. */
  outbound_flight_number?: string;
  inbound_flight_number?: string;
  postanki: string;
  ai_povzetek: string;
  badge?: string;
  booking_url?: string;
  /** Structured fields for booking deep-links + AI plan scheduling. */
  origin_iata?: string;
  destination_iata?: string;
  /** Open-jaw: actual return-leg airports (may differ from outbound mirror). */
  inbound_origin_iata?: string;
  inbound_destination_iata?: string;
  /** YYYY-MM-DD */
  depart_date?: string;
  /** YYYY-MM-DD */
  return_date?: string;
  /** HH:mm local from offer ISO */
  outbound_depart?: string;
  outbound_arrive?: string;
  outbound_arrive_day_offset?: number;
  inbound_depart?: string;
  inbound_arrive?: string;
  inbound_arrive_day_offset?: number;
  /** Human duration e.g. "14h 30m" (Skyscanner-style). */
  outbound_duration?: string;
  inbound_duration?: string;
  /** Total minutes for ranking (outbound + inbound). */
  duration_minutes?: number;
  /** Full offer timestamps (with offset when available) — source of truth for duration. */
  outbound_depart_iso?: string;
  outbound_arrive_iso?: string;
  inbound_depart_iso?: string;
  inbound_arrive_iso?: string;
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

  if (typeof data === "string") {
    const parsed = tryParseJsonString(data);
    if (parsed != null) return extractFlightArray(parsed);
    return [];
  }

  const record = asRecord(data);
  if (!record) return [];

  for (const key of ["offers", "flights", "results", "items", "body", "output"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      const nested = extractFlightArray(value);
      if (nested.length > 0) return nested;
    }
    // Make status often returns Duffel list shape: offers: { meta, data: [...] }
    if (value && typeof value === "object") {
      const nested = extractFlightArray(value);
      if (nested.length > 0) return nested;
    }
  }

  // Duffel / Make often nests as data → data → offers (sometimes stringified).
  for (const key of ["data", "Data"]) {
    const nested = extractFlightArray(record[key]);
    if (nested.length > 0) return nested;
  }

  if (
    readString(record, "destinacija", "destination", "destination_iata") ||
    readString(record, "prevoznik", "carrier", "airline", "airline_name") ||
    Array.isArray(record.slices)
  ) {
    return [record];
  }

  return [];
}

function readNestedIata(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";
  return readString(record, "iata_code", "iata", "code").toUpperCase();
}

/** Map a raw Duffel offer into the Make flight card shape (no Gemini needed). */
function parseDuffelOfferAsMakeFlight(item: unknown, index: number): MakeSearchFlight | null {
  const record = asRecord(item);
  if (!record || !Array.isArray(record.slices) || record.slices.length === 0) return null;

  const firstSlice = asRecord(record.slices[0]);
  if (!firstSlice) return null;
  const segments = Array.isArray(firstSlice.segments) ? firstSlice.segments : [];
  const firstSeg = asRecord(segments[0]);
  const lastSeg = asRecord(segments[segments.length - 1]) ?? firstSeg;

  const returnSlice = record.slices.length > 1 ? asRecord(record.slices[1]) : null;
  const returnSegments =
    returnSlice && Array.isArray(returnSlice.segments) ? returnSlice.segments : [];
  const returnFirstSeg = asRecord(returnSegments[0]);
  const returnLastSeg =
    asRecord(returnSegments[returnSegments.length - 1]) ?? returnFirstSeg;

  const origin =
    readNestedIata(firstSlice.origin) || readNestedIata(firstSeg?.origin);
  const destination =
    readNestedIata(firstSlice.destination) || readNestedIata(lastSeg?.destination);
  const inboundOrigin =
    readNestedIata(returnSlice?.origin) || readNestedIata(returnFirstSeg?.origin);
  const inboundDestination =
    readNestedIata(returnSlice?.destination) ||
    readNestedIata(returnLastSeg?.destination);
  const owner = asRecord(record.owner);
  const marketing = asRecord(firstSeg?.marketing_carrier ?? firstSeg?.operating_carrier);
  const carrier =
    readString(owner ?? {}, "name") || readString(marketing ?? {}, "name");
  const airlineIata =
    readString(owner ?? {}, "iata_code", "iata").toUpperCase() ||
    readString(marketing ?? {}, "iata_code", "iata").toUpperCase();
  const outboundFlightNumber = flightNumberFromSegment(firstSeg, airlineIata);
  const inboundFlightNumber = flightNumberFromSegment(returnFirstSeg, airlineIata);
  const departing = readString(firstSeg ?? {}, "departing_at");
  const arriving = readString(lastSeg ?? {}, "arriving_at");
  const returning = readString(returnFirstSeg ?? {}, "departing_at");
  const returnArriving = readString(returnLastSeg ?? {}, "arriving_at");
  const price = readNumber(record, "total_amount", "price_total", "cena_eur");
  if (!origin && !destination && price <= 0) return null;

  const outboundStops = Math.max(0, segments.length - 1);
  const returnStops = returnSegments.length > 0 ? Math.max(0, returnSegments.length - 1) : 0;
  const outLayovers = layoverIatasFromSegments(segments);
  const inLayovers = layoverIatasFromSegments(returnSegments);
  const postanki =
    returnSegments.length > 0
      ? `${formatStopsWithLayovers(outboundStops, outLayovers)}/${formatStopsWithLayovers(returnStops, inLayovers)}`
      : formatStopsWithLayovers(outboundStops, outLayovers);

  const outMins = duffelSliceDurationMin({
    duration: readString(firstSlice, "duration") || undefined,
    segments: segments as Array<{
      duration?: string;
      departing_at?: string;
      arriving_at?: string;
      origin?: { iata_code?: string };
      destination?: { iata_code?: string };
    }>,
  });
  const inMins = duffelSliceDurationMin({
    duration: readString(returnSlice ?? {}, "duration") || undefined,
    segments: returnSegments as Array<{
      duration?: string;
      departing_at?: string;
      arriving_at?: string;
      origin?: { iata_code?: string };
      destination?: { iata_code?: string };
    }>,
  });
  const outbound_duration = formatDurationMinutes(outMins);
  const inbound_duration = formatDurationMinutes(inMins);
  const duration_minutes =
    outMins > 0 || inMins > 0 ? outMins + inMins : undefined;

  return {
    id: readString(record, "id") || `duffel-${index}`,
    destinacija: formatMakeRoute(origin, destination),
    cena_eur: price,
    odhod: departing ? formatDepartureDatetime(departing) : "—",
    ...(returning ? { povratek: formatDepartureDatetime(returning) } : {}),
    prevoznik: carrier || "—",
    ...(airlineIata ? { airline_iata: airlineIata } : {}),
    ...(outboundFlightNumber ? { outbound_flight_number: outboundFlightNumber } : {}),
    ...(inboundFlightNumber ? { inbound_flight_number: inboundFlightNumber } : {}),
    postanki,
    ai_povzetek: "",
    ...(origin ? { origin_iata: origin } : {}),
    ...(destination ? { destination_iata: destination } : {}),
    ...(inboundOrigin ? { inbound_origin_iata: inboundOrigin } : {}),
    ...(inboundDestination ? { inbound_destination_iata: inboundDestination } : {}),
    ...(departing ? { depart_date: isoDatePart(departing) } : {}),
    ...(returning ? { return_date: isoDatePart(returning) } : {}),
    ...(departing ? { outbound_depart: timeHmFromIso(departing) } : {}),
    ...(arriving ? { outbound_arrive: timeHmFromIso(arriving) } : {}),
    ...(departing && arriving
      ? { outbound_arrive_day_offset: calendarDayOffset(departing, arriving) }
      : {}),
    ...(returning ? { inbound_depart: timeHmFromIso(returning) } : {}),
    ...(returnArriving ? { inbound_arrive: timeHmFromIso(returnArriving) } : {}),
    ...(departing ? { outbound_depart_iso: departing } : {}),
    ...(arriving ? { outbound_arrive_iso: arriving } : {}),
    ...(returning ? { inbound_depart_iso: returning } : {}),
    ...(returnArriving ? { inbound_arrive_iso: returnArriving } : {}),
    ...(outbound_duration ? { outbound_duration } : {}),
    ...(inbound_duration ? { inbound_duration } : {}),
    ...(duration_minutes != null ? { duration_minutes } : {}),
  };
}

function flightNumberFromSegment(
  segment: Record<string, unknown> | null | undefined,
  airlineIata: string,
): string {
  if (!segment) return "";
  const raw = readString(
    segment,
    "marketing_carrier_flight_number",
    "operating_carrier_flight_number",
    "flight_number",
  ).replace(/\s+/g, "");
  if (!raw) return "";
  if (/^[A-Z0-9]{2}\d{1,4}$/i.test(raw)) return raw.toUpperCase();
  if (/^\d{1,4}$/.test(raw) && /^[A-Z0-9]{2}$/i.test(airlineIata)) {
    return `${airlineIata.toUpperCase()}${raw}`;
  }
  return raw.toUpperCase();
}

/** Stable badge keys — UI translates via i18n. Ranked by value, not raw price. */
const TOP_MAKE_FLIGHT_BADGES = ["best", "best_value", "alternative"] as const;

/** Max parallel Make/Duffel searches when user lists several departure airports. */
export const MAX_MULTI_ORIGIN_SEARCHES = 5;

/** Soft caps for long-haul legs (minutes). Above these, price alone must not win. */
const LEG_OK_MINS = 18 * 60;
const LEG_LONG_MINS = 22 * 60;
const LEG_EXTREME_MINS = 26 * 60;

function legMinutes(flight: MakeSearchFlight): { out: number; inn: number; total: number; worst: number } {
  const out = parseDurationMinutes(flight.outbound_duration ?? "");
  const inn = parseDurationMinutes(flight.inbound_duration ?? "");
  const total =
    flight.duration_minutes && flight.duration_minutes > 0
      ? flight.duration_minutes
      : out + inn;
  const worst = Math.max(out, inn, 0);
  return { out, inn, total, worst };
}

/**
 * Skyscanner-style value score: price + time penalty.
 * A €517 / 31h return loses to €603 / ~14h — nobody wants a day in PEK "for free".
 */
export function scoreMakeSearchFlight(flight: MakeSearchFlight): number {
  const price = flight.cena_eur > 0 ? flight.cena_eur : 50_000;
  const { total, worst } = legMinutes(flight);
  const totalHours = total > 0 ? total / 60 : 0;
  const worstHours = worst > 0 ? worst / 60 : totalHours;

  // Baseline: ~€10 per hour of total travel (outbound+inbound).
  let penalty = totalHours * 10;

  if (worst > LEG_OK_MINS) {
    penalty += ((worst - LEG_OK_MINS) / 60) * 45;
  }
  if (worst > LEG_LONG_MINS) {
    penalty += ((worst - LEG_LONG_MINS) / 60) * 90;
  }
  if (worst > LEG_EXTREME_MINS) {
    penalty += ((worst - LEG_EXTREME_MINS) / 60) * 220;
  }

  // Mild nudge so slightly longer but much cheaper still can win.
  void worstHours;
  return price + penalty;
}

export function selectTopMakeSearchFlights(
  flights: MakeSearchFlight[],
  opts?: { showOriginBadge?: boolean; keepExistingBadges?: boolean },
): MakeSearchFlight[] {
  // Always re-rank by value score. Ignoring prior Gemini/Make "cheapest" badges
  // so a 31h layover cannot stay on top just because a badge was pre-set.
  void opts?.keepExistingBadges;

  const usable = [...flights].filter((f) => f.cena_eur > 0 || f.destinacija !== "—");

  const ranked = [...usable].sort((a, b) => {
    const sa = scoreMakeSearchFlight(a);
    const sb = scoreMakeSearchFlight(b);
    if (sa !== sb) return sa - sb;
    const da = a.duration_minutes ?? Number.POSITIVE_INFINITY;
    const db = b.duration_minutes ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    if (a.cena_eur !== b.cena_eur) return a.cena_eur - b.cena_eur;
    return a.odhod.localeCompare(b.odhod);
  }).slice(0, 3);

  // Relabel: among top 3, put a true "cheapest" badge on the lowest price if not already #1.
  const cheapestId = ranked.reduce(
    (best, f) => (!best || f.cena_eur < best.cena_eur ? f : best),
    null as MakeSearchFlight | null,
  )?.id;

  return ranked.map((flight, index) => {
    let base: string = TOP_MAKE_FLIGHT_BADGES[index] || `option_${index + 1}`;
    if (index > 0 && flight.id === cheapestId) {
      base = "cheapest";
    }
    const badge =
      opts?.showOriginBadge && flight.origin_iata
        ? `${base} · ${flight.origin_iata}`
        : base;
    return {
      ...flight,
      badge,
      ai_povzetek: flight.ai_povzetek?.trim() || "",
    };
  });
}

function layoverIatasFromSegments(segments: unknown[]): string[] {
  if (segments.length < 2) return [];
  const layovers: string[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = asRecord(segments[i]);
    const next = asRecord(segments[i + 1]);
    const via =
      readNestedIata(seg?.destination) ||
      readNestedIata(next?.origin);
    if (via && !layovers.includes(via)) layovers.push(via);
  }
  return layovers;
}

function formatStopsWithLayovers(stops: number, layovers: string[]): string {
  if (stops <= 0) return "0";
  if (layovers.length === 0) return String(stops);
  return `${stops}|${layovers.slice(0, 2).join(",")}`;
}

function flightDedupeKey(flight: MakeSearchFlight): string {
  return (
    flight.id ||
    `${flight.origin_iata ?? ""}|${flight.destinacija}|${flight.odhod}|${flight.cena_eur}`
  );
}

/** Merge offers from several origin searches, then pick global top 3. */
export function mergeAndRankMakeSearchFlights(
  flights: MakeSearchFlight[],
  opts?: { showOriginBadge?: boolean },
): MakeSearchFlight[] {
  const deduped: MakeSearchFlight[] = [];
  const seen = new Set<string>();
  for (const flight of flights) {
    const key = flightDedupeKey(flight);
    if (seen.has(key)) continue;
    seen.add(key);
    // Drop per-origin badges so global ranking can re-label.
    deduped.push({ ...flight, badge: undefined });
  }
  return selectTopMakeSearchFlights(deduped, {
    showOriginBadge: opts?.showOriginBadge ?? true,
  });
}

function formatDepartureDatetime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function isoDatePart(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "";
}

function timeHmFromIso(iso: string): string {
  const match = iso.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

/** Add minutes to HH:mm — naive (same timezone). Prefer estimateArriveLocal. */
export function addMinutesToHm(
  hm: string,
  minutes: number,
): { time: string; dayOffset: number } | null {
  const match = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !Number.isFinite(minutes) || minutes <= 0) return null;
  const start = Number.parseInt(match[1]!, 10) * 60 + Number.parseInt(match[2]!, 10);
  const total = start + Math.round(minutes);
  const dayOffset = Math.floor(total / (24 * 60));
  const tod = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(tod / 60)).padStart(2, "0");
  const mm = String(tod % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, dayOffset: Math.max(0, dayOffset) };
}

/**
 * Estimate local arrival at destination.
 * Uses IATA timezones when known; otherwise naive depart+duration.
 */
export function estimateArriveLocal(params: {
  departHm: string;
  departDate?: string;
  durationMinutes: number;
  fromIata?: string;
  toIata?: string;
}): { time: string; dayOffset: number } | null {
  const date = params.departDate?.trim() ?? "";
  if (date && params.fromIata && params.toIata) {
    const zoned = estimateLocalArrival({
      departHm: params.departHm,
      departDate: date,
      durationMinutes: params.durationMinutes,
      fromIata: params.fromIata,
      toIata: params.toIata,
    });
    if (zoned) return zoned;
  }
  return addMinutesToHm(params.departHm, params.durationMinutes);
}

/**
 * Elapsed minutes between two timestamps.
 * With IATA codes, naive local ISO (no Z/offset) is interpreted in each airport's TZ —
 * so MUC 21:10 → HKT 17:55 is ~14h45, not wall-clock 20h45.
 */
export function elapsedMinutesBetween(
  departIso: string,
  arriveIso: string,
  fromIata?: string,
  toIata?: string,
): number {
  // Duffel offsets are UTC truth — do not re-interpret local parts in airport TZ.
  if (isoHasExplicitOffset(departIso) && isoHasExplicitOffset(arriveIso)) {
    const a = Date.parse(departIso);
    const b = Date.parse(arriveIso);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      return Math.round((b - a) / 60_000);
    }
  }

  if (fromIata && toIata) {
    const zoned = elapsedMinutesBetweenAirportLocals(
      departIso,
      arriveIso,
      fromIata,
      toIata,
    );
    if (zoned != null) return zoned;
  }

  const a = Date.parse(departIso);
  const b = Date.parse(arriveIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 60_000);
}

function ymdFromDateish(raw?: string): string {
  const trimmed = (raw ?? "").trim();
  const iso = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1]!;

  // "26. okt. 2026, 21:10" / "26 Oct 2026, 21:10" / "26 October 2026"
  const human = trimmed.match(
    /^(\d{1,2})[.\s]+([A-Za-zčšžČŠŽäöüÄÖÜß.]+)\.?[\s,]+(\d{4})/,
  );
  if (!human) return "";
  const day = Number.parseInt(human[1]!, 10);
  const year = Number.parseInt(human[3]!, 10);
  const month = monthIndexFromLabel(human[2]!);
  if (!month || day < 1 || day > 31 || year < 2000) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const MONTH_LABEL_TO_INDEX: Record<string, number> = {
  jan: 1,
  januar: 1,
  january: 1,
  feb: 2,
  februar: 2,
  february: 2,
  mar: 3,
  marec: 3,
  march: 3,
  apr: 4,
  april: 4,
  maj: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  avg: 8,
  avgust: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  october: 10,
  oct: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function monthIndexFromLabel(raw: string): number {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return MONTH_LABEL_TO_INDEX[key] ?? 0;
}

/** Infer +N calendar days when arrive local clock is earlier than / equal to depart. */
export function inferArriveDayOffset(
  departHm: string,
  arriveHm: string,
  storedOffset?: number,
): number {
  if (storedOffset != null && storedOffset > 0) return Math.floor(storedOffset);
  const dep = normalizeHm(departHm);
  const arr = normalizeHm(arriveHm);
  if (!dep || !arr) return Math.max(0, storedOffset ?? 0);
  const [dh, dm] = dep.split(":").map((x) => Number.parseInt(x, 10));
  const [ah, am] = arr.split(":").map((x) => Number.parseInt(x, 10));
  const depMins = dh! * 60 + dm!;
  const arrMins = ah! * 60 + am!;
  // Overnight / next-day local arrival (common on long-haul eastbound).
  if (arrMins <= depMins) return 1;
  return 0;
}

function addCalendarDaysYmd(ymd: string, days: number): string {
  const base = Date.parse(`${ymd}T12:00:00Z`);
  if (!Number.isFinite(base)) return ymd;
  const d = new Date(base + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function normalizeHm(hm: string): string | null {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return `${String(Number.parseInt(m[1]!, 10)).padStart(2, "0")}:${m[2]}`;
}

/** Naive same-timezone gap (what Make often stores as “duration”). */
export function naiveWallClockMinutes(
  departHm: string,
  arriveHm: string,
  arriveDayOffset = 0,
): number {
  const dep = normalizeHm(departHm);
  const arr = normalizeHm(arriveHm);
  if (!dep || !arr) return 0;
  const [dh, dm] = dep.split(":").map((x) => Number.parseInt(x, 10));
  const [ah, am] = arr.split(":").map((x) => Number.parseInt(x, 10));
  let mins = ah! * 60 + am! - (dh! * 60 + dm!);
  let offset = arriveDayOffset;
  if (offset <= 0 && mins <= 0) offset = 1;
  mins += offset * 24 * 60;
  return mins > 0 ? mins : 0;
}

/** Same-timezone wall under 8h is one segment / clock subtraction, not a 1-stop long-haul. */
const NAIVE_WALL_JUNK_MAX_MIN = 8 * 60;

/**
 * Choose between timezone-elapsed minutes and a provider-stored duration.
 *
 * - When stored ≈ wall-clock gap and stored is long: take the shorter of TZ vs stored
 *   (eastbound Make 20h45 → TZ 14h45; westbound HKT→MUC TZ 20h30 → Duffel 14h45).
 * - When stored ≈ wall-clock and stored is short (<8h) while TZ is longer: trust TZ
 *   (NRT 09:15→VIE 16:55 "7h 40m", BKK 15:15→VIE 16:20 "1h 5m").
 * - When stored is far from wall-clock (junk "7h"), trust TZ.
 * - Explicit UTC-offset ISO timestamps are authoritative — skip this merge.
 */
function preferTravelMinutes(
  tzMins: number,
  stored: number,
  naive: number,
): number {
  if (tzMins <= 0) return stored > 0 ? stored : 0;
  if (stored <= 0) return tzMins;
  const nearNaive = naive > 0 && Math.abs(stored - naive) <= 30;
  if (nearNaive) {
    if (stored < tzMins && stored < NAIVE_WALL_JUNK_MAX_MIN) return tzMins;
    return Math.min(tzMins, stored);
  }
  // Far from wall-clock: short junk → TZ; much longer provider total → stored.
  if (stored > tzMins + 3 * 60) return stored;
  return tzMins;
}

/**
 * Real travel minutes using airport timezones.
 * Works from full ISO or from local HH:mm + date (+ day offset).
 */
export function travelDurationMinutes(params: {
  departIso?: string;
  arriveIso?: string;
  departHm?: string;
  arriveHm?: string;
  /** YYYY-MM-DD or ISO datetime */
  departDate?: string;
  arriveDayOffset?: number;
  fromIata?: string;
  toIata?: string;
  storedLabel?: string;
}): number {
  const from = (params.fromIata ?? "").trim().toUpperCase();
  const to = (params.toIata ?? "").trim().toUpperCase();
  const stored = parseDurationMinutes(params.storedLabel ?? "");
  const depHm = params.departHm ? normalizeHm(params.departHm) : null;
  const arrHm = params.arriveHm ? normalizeHm(params.arriveHm) : null;
  const dayOffForNaive = inferArriveDayOffset(
    depHm ?? "",
    arrHm ?? "",
    params.arriveDayOffset,
  );
  const naive =
    depHm && arrHm ? naiveWallClockMinutes(depHm, arrHm, dayOffForNaive) : 0;

  if (params.departIso && params.arriveIso && from && to) {
    const mins = elapsedMinutesBetween(params.departIso, params.arriveIso, from, to);
    if (mins > 0) return preferTravelMinutes(mins, stored, naive);
  }

  // Prefer ISO date; also accept human "26. okt. 2026, 21:10" from Make `odhod`.
  const ymd =
    ymdFromDateish(params.departDate) ||
    ymdFromDateish(params.departIso) ||
    // Last resort: any mid-year date so TZ math still works when Make omits depart_date.
    (depHm && arrHm && from && to ? "2026-10-15" : "");
  if (depHm && arrHm && ymd && from && to) {
    const dayOff = inferArriveDayOffset(depHm, arrHm, params.arriveDayOffset);
    const arriveYmd = addCalendarDaysYmd(ymd, dayOff);
    const mins = elapsedMinutesBetween(
      `${ymd}T${depHm}:00`,
      `${arriveYmd}T${arrHm}:00`,
      from,
      to,
    );
    if (mins > 0) return preferTravelMinutes(mins, stored, naive);
  }

  // If stored duration is just the naive wall-clock gap, drop it (TZ missing).
  if (stored > 0 && naive > 0 && Math.abs(stored - naive) <= 5) {
    return 0;
  }
  return stored;
}

export function formatDurationMinutes(mins: number): string {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Pick the most trustworthy duration. Naive local-clock math (no TZ) underestimates
 * long-haul (e.g. MXP 10:30 → HKT 17:50 = "7h20m" F-35). Prefer the longer of
 * Duffel slice duration vs timestamp elapsed when both exist.
 */
export function pickTravelDurationRaw(...candidates: Array<string | undefined | null>): string {
  let bestRaw = "";
  let bestMins = 0;
  for (const raw of candidates) {
    if (!raw?.trim()) continue;
    const mins = parseDurationMinutes(raw.trim());
    if (mins > bestMins) {
      bestMins = mins;
      bestRaw = raw.trim();
    }
  }
  return bestRaw;
}

/** Parse PT14H30M or "14h 30m" → minutes. */
export function parseDurationMinutes(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const iso = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (iso) {
    return Number.parseInt(iso[1] || "0", 10) * 60 + Number.parseInt(iso[2] || "0", 10);
  }
  const human = trimmed.match(/(\d+)\s*h(?:\s*(\d+)\s*m)?/i);
  if (human) {
    return Number.parseInt(human[1]!, 10) * 60 + Number.parseInt(human[2] || "0", 10);
  }
  return 0;
}

/** PT14H30M → "14h 30m" (Skyscanner-style). */
export function formatTravelDuration(raw: string): string {
  const mins = parseDurationMinutes(raw);
  if (mins <= 0) {
    // Already human?
    if (/^\d+\s*h/i.test(raw.trim())) return raw.trim().replace(/\s+/g, " ");
    return "";
  }
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function calendarDayOffset(departIso: string, arriveIso: string): number {
  const from = isoDatePart(departIso);
  const to = isoDatePart(arriveIso);
  if (!from || !to) return 0;
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function formatMakeRoute(origin: string, destination: string): string {
  if (origin && destination) return `${origin} → ${destination}`;
  return destination || origin || "—";
}

/** Parse "LJU → HKT" style route labels. */
export function parseMakeFlightRoute(destinacija: string): { from?: string; to?: string } {
  const match = destinacija
    .toUpperCase()
    .match(/\b([A-Z]{3})\s*(?:→|->|–|-)\s*([A-Z]{3})\b/);
  if (!match) return {};
  return { from: match[1], to: match[2] };
}

export function buildSkyscannerFlightUrl(opts: {
  from: string;
  to: string;
  departDate: string;
  returnDate?: string;
  adults?: number;
  /** Optional IATA airline filter — still a search page, not a locked offer. */
  airlineIata?: string;
}): string | null {
  const from = opts.from.trim().toLowerCase();
  const to = opts.to.trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(from) || !/^[a-z]{3}$/.test(to)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.departDate)) return null;
  const fmt = (d: string) => d.replace(/-/g, "").slice(2);
  const seg =
    opts.returnDate && /^\d{4}-\d{2}-\d{2}$/.test(opts.returnDate)
      ? `${fmt(opts.departDate)}/${fmt(opts.returnDate)}`
      : fmt(opts.departDate);
  const adults = Math.max(1, Math.min(9, opts.adults ?? 1));
  const params = new URLSearchParams({ adults: String(adults) });
  const airline = opts.airlineIata?.trim().toLowerCase();
  if (airline && /^[a-z0-9]{2}$/.test(airline)) {
    params.set("airlines", airline);
  }
  return `https://www.skyscanner.net/transport/flights/${from}/${to}/${seg}/?${params.toString()}`;
}

export function skyscannerUrlForMakeFlight(
  flight: MakeSearchFlight,
  adults = 1,
  fallback?: { from?: string; to?: string; departDate?: string; returnDate?: string },
): string | null {
  const route = parseMakeFlightRoute(flight.destinacija);
  const from = flight.origin_iata || route.from || fallback?.from;
  const to = flight.destination_iata || route.to || fallback?.to;
  // Prefer the user's searched dates when present.
  const departDate = fallback?.departDate || flight.depart_date;
  const returnDate = fallback?.returnDate || flight.return_date;
  if (!from || !to || !departDate) return null;
  return buildSkyscannerFlightUrl({
    from,
    to,
    departDate,
    returnDate,
    adults,
    airlineIata: flight.airline_iata,
  });
}

/** Alias kept for older imports — Skyscanner search for the card route/dates. */
export function externalFlightSearchUrlForMakeFlight(
  flight: MakeSearchFlight,
  adults = 1,
  fallback?: { from?: string; to?: string; departDate?: string; returnDate?: string },
): string | null {
  return skyscannerUrlForMakeFlight(flight, adults, fallback);
}

function parseFlightItem(item: unknown, index: number): MakeSearchFlight | null {
  const record = asRecord(item);
  if (!record) return null;

  const originObj = asRecord(record.origin);
  const destObj = asRecord(record.destination);
  const airlineObj = asRecord(record.airline);
  const priceObj = asRecord(record.price);

  const originIata = (
    readString(record, "origin_iata") ||
    readString(originObj ?? {}, "iata", "iata_code", "code") ||
    readString(record, "origin")
  ).toUpperCase();
  const destIata = (
    readString(record, "destination_iata") ||
    readString(destObj ?? {}, "iata", "iata_code", "code") ||
    readString(record, "destination")
  ).toUpperCase();
  const destinacija =
    readString(record, "destinacija", "dest") ||
    formatMakeRoute(originIata, destIata);
  const prevoznik =
    readString(record, "prevoznik", "carrier", "airline_name") ||
    readString(airlineObj ?? {}, "name") ||
    readString(record, "airline");
  const departureIso = readString(record, "departure_datetime", "departure", "depart_datetime");
  const odhod =
    readString(record, "odhod", "depart") ||
    (departureIso ? formatDepartureDatetime(departureIso) : "");
  const returnIso = readString(
    record,
    "return_departure_datetime",
    "return_datetime",
    "return_depart",
    "povratek",
  );
  const povratek =
    readString(record, "povratek", "return_odhod") ||
    (returnIso ? formatDepartureDatetime(returnIso) : "");
  const badge = readString(record, "badge", "rank_label") || undefined;
  const ai_povzetek = readString(record, "ai_povzetek", "summary", "ai_summary", "povzetek");

  // Duffel offers are handled by parseDuffelOfferAsMakeFlight (slices + total_amount).
  if (Array.isArray(record.slices)) return null;

  if (!destinacija && !prevoznik && !odhod) return null;
  if (destinacija === "—" && !prevoznik && !odhod) return null;

  const booking_url = readString(record, "booking_url", "url", "link", "rezervacija_url") || undefined;
  const rank = readString(record, "rank", "id");
  const priceCurrency = (
    readString(record, "price_currency", "currency") ||
    readString(priceObj ?? {}, "currency")
  ).toUpperCase();
  const priceTotal = readNumber(
    record,
    "price_total",
    "total_amount",
    "cena_eur",
    "price_eur",
    "cena",
  ) || readNumber(priceObj ?? {}, "total", "per_person", "amount");
  const cena_eur =
    priceCurrency && priceCurrency !== "EUR" && priceTotal > 0
      ? priceTotal
      : priceTotal ||
        readNumber(record, "cena_eur", "price_eur", "price_total", "total_amount", "price", "cena");

  const priceBasisRaw = readString(record, "price_basis").toLowerCase();
  const price_basis =
    priceBasisRaw === "party_total" || priceBasisRaw === "per_adult"
      ? (priceBasisRaw as "party_total" | "per_adult")
      : undefined;
  const travelersRaw = readNumber(record, "travelers", "pax", "passengers");
  const travelers =
    travelersRaw > 0 ? Math.min(9, Math.round(travelersRaw)) : undefined;

  const stopsRaw =
    record.stops_outbound ?? record.stops ?? record.stop_count ?? record.postanki;

  const route = parseMakeFlightRoute(destinacija);
  const origin =
    (/^[A-Z]{3}$/.test(originIata) ? originIata : "") || route.from || "";
  const destination =
    (/^[A-Z]{3}$/.test(destIata) ? destIata : "") || route.to || "";
  const arrivalIso = readString(
    record,
    "arrival_datetime",
    "arrival",
    "outbound_arrival_datetime",
    "prihod",
  );
  const returnArrivalIso = readString(
    record,
    "return_arrival_datetime",
    "inbound_arrival_datetime",
    "return_arrival",
  );
  const airlineIata = (
    readString(record, "airline_iata", "carrier_iata") ||
    readString(airlineObj ?? {}, "iata", "iata_code", "code")
  ).toUpperCase();

  const outDurationMinsField = readNumber(
    record,
    "duration_outbound_minutes",
    "outbound_duration_minutes",
  );
  const inDurationMinsField = readNumber(
    record,
    "duration_return_minutes",
    "duration_inbound_minutes",
    "inbound_duration_minutes",
  );

  const storedOutDuration = pickTravelDurationRaw(
    outDurationMinsField > 0
      ? `PT${Math.floor(outDurationMinsField / 60)}H${outDurationMinsField % 60}M`
      : "",
    readString(record, "outbound_duration", "duration_outbound"),
    readString(record, "duration"),
  );
  const storedInDuration = pickTravelDurationRaw(
    inDurationMinsField > 0
      ? `PT${Math.floor(inDurationMinsField / 60)}H${inDurationMinsField % 60}M`
      : "",
    readString(record, "inbound_duration", "duration_inbound"),
  );
  let outMins = parseDurationMinutes(storedOutDuration) || outDurationMinsField;
  let inMins = parseDurationMinutes(storedInDuration) || inDurationMinsField;

  let outbound_depart =
    (departureIso && timeHmFromIso(departureIso)) ||
    readString(record, "outbound_depart", "depart_time") ||
    "";
  if (!outbound_depart) {
    const fromOdhod = odhod.match(/(\d{1,2}:\d{2})\s*$/);
    if (fromOdhod) outbound_depart = fromOdhod[1]!;
  }
  let outbound_arrive =
    (arrivalIso && timeHmFromIso(arrivalIso)) ||
    readString(record, "outbound_arrive", "arrive_time", "prihod_ura") ||
    "";
  let outbound_arrive_day_offset =
    departureIso && arrivalIso ? calendarDayOffset(departureIso, arrivalIso) : 0;
  if (!outbound_arrive && outbound_depart && outMins > 0) {
    const est = estimateArriveLocal({
      departHm: outbound_depart,
      departDate: departureIso || undefined,
      durationMinutes: outMins,
      fromIata: origin,
      toIata: destination,
    });
    if (est) {
      outbound_arrive = est.time;
      outbound_arrive_day_offset = est.dayOffset;
    }
  }

  let inbound_depart =
    (returnIso && timeHmFromIso(returnIso)) ||
    readString(record, "inbound_depart", "return_depart_time") ||
    "";
  if (!inbound_depart && povratek) {
    const fromPov = povratek.match(/(\d{1,2}:\d{2})\s*$/);
    if (fromPov) inbound_depart = fromPov[1]!;
  }
  let inbound_arrive =
    (returnArrivalIso && timeHmFromIso(returnArrivalIso)) ||
    readString(record, "inbound_arrive", "return_arrive_time") ||
    "";
  let inbound_arrive_day_offset =
    returnIso && returnArrivalIso ? calendarDayOffset(returnIso, returnArrivalIso) : 0;
  if (!inbound_arrive && inbound_depart && inMins > 0) {
    const est = estimateArriveLocal({
      departHm: inbound_depart,
      departDate: returnIso || undefined,
      durationMinutes: inMins,
      fromIata: destination,
      toIata: origin,
    });
    if (est) {
      inbound_arrive = est.time;
      inbound_arrive_day_offset = est.dayOffset;
    }
  }

  if (outbound_depart && outbound_arrive) {
    outbound_arrive_day_offset = inferArriveDayOffset(
      outbound_depart,
      outbound_arrive,
      outbound_arrive_day_offset,
    );
  }
  if (inbound_depart && inbound_arrive) {
    inbound_arrive_day_offset = inferArriveDayOffset(
      inbound_depart,
      inbound_arrive,
      inbound_arrive_day_offset,
    );
  }

  // Recompute duration with airport timezones once local times are known.
  // Make often sends duration = naive wall-clock (MUC 21:10→HKT 17:55 = 20h45).
  const outTzMins = travelDurationMinutes({
    departIso: departureIso || undefined,
    arriveIso: arrivalIso || undefined,
    departHm: outbound_depart || undefined,
    arriveHm: outbound_arrive || undefined,
    departDate: departureIso || odhod || undefined,
    arriveDayOffset: outbound_arrive_day_offset,
    fromIata: origin,
    toIata: destination,
    storedLabel: storedOutDuration,
  });
  const inTzMins = travelDurationMinutes({
    departIso: returnIso || undefined,
    arriveIso: returnArrivalIso || undefined,
    departHm: inbound_depart || undefined,
    arriveHm: inbound_arrive || undefined,
    departDate: returnIso || povratek || undefined,
    arriveDayOffset: inbound_arrive_day_offset,
    fromIata: destination,
    toIata: origin,
    storedLabel: storedInDuration,
  });
  if (outTzMins > 0) outMins = outTzMins;
  if (inTzMins > 0) inMins = inTzMins;

  const outbound_duration = formatDurationMinutes(outMins);
  const inbound_duration = formatDurationMinutes(inMins);
  const claimedTotal = readNumber(record, "duration_minutes");
  const computedTotal = outMins > 0 || inMins > 0 ? outMins + inMins : 0;
  const totalMins =
    claimedTotal > 0 && computedTotal > 0
      ? Math.max(claimedTotal, computedTotal)
      : claimedTotal > 0
        ? claimedTotal
        : computedTotal > 0
          ? computedTotal
          : undefined;

  return {
    id: rank || readString(record, "id") || `flight-${index}`,
    destinacija: destinacija || "—",
    cena_eur,
    ...(price_basis ? { price_basis } : {}),
    ...(travelers != null ? { travelers } : {}),
    odhod: odhod || "—",
    ...(povratek ? { povratek } : {}),
    prevoznik: prevoznik || "—",
    ...(airlineIata && /^[A-Z0-9]{2}$/.test(airlineIata) ? { airline_iata: airlineIata } : {}),
    postanki: formatPostanki({ ...record, postanki: stopsRaw }),
    ai_povzetek,
    badge,
    booking_url,
    ...(origin ? { origin_iata: origin } : {}),
    ...(destination ? { destination_iata: destination } : {}),
    ...(departureIso ? { depart_date: isoDatePart(departureIso) } : {}),
    ...(returnIso && isoDatePart(returnIso)
      ? { return_date: isoDatePart(returnIso) }
      : {}),
    ...(outbound_depart ? { outbound_depart } : {}),
    ...(outbound_arrive ? { outbound_arrive } : {}),
    ...(outbound_arrive_day_offset > 0
      ? { outbound_arrive_day_offset }
      : {}),
    ...(inbound_depart ? { inbound_depart } : {}),
    ...(inbound_arrive ? { inbound_arrive } : {}),
    ...(inbound_arrive_day_offset > 0 ? { inbound_arrive_day_offset } : {}),
    ...(departureIso ? { outbound_depart_iso: departureIso } : {}),
    ...(arrivalIso ? { outbound_arrive_iso: arrivalIso } : {}),
    ...(returnIso ? { inbound_depart_iso: returnIso } : {}),
    ...(returnArrivalIso ? { inbound_arrive_iso: returnArrivalIso } : {}),
    ...(outbound_duration ? { outbound_duration } : {}),
    ...(inbound_duration ? { inbound_duration } : {}),
    ...(totalMins != null ? { duration_minutes: totalMins } : {}),
  };
}

export function parseMakeSearchFlights(
  data: unknown,
  opts?: { rank?: boolean },
): MakeSearchFlight[] {
  const flights = extractFlightArray(data)
    .slice(0, 80)
    .map((item, index) => parseDuffelOfferAsMakeFlight(item, index) ?? parseFlightItem(item, index))
    .filter((item): item is MakeSearchFlight => item != null);
  const deduped: MakeSearchFlight[] = [];
  const seen = new Set<string>();
  for (const flight of flights) {
    const key = flightDedupeKey(flight);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(flight);
  }
  if (opts?.rank === false) return deduped;
  return selectTopMakeSearchFlights(deduped, { keepExistingBadges: true });
}

export type HeroTripSearchHints = {
  tripType?: "return" | "oneway" | "openjaw";
  returnFromIata?: string;
  departDate?: string;
  returnDate?: string;
  originIata?: string;
  destinationIata?: string;
  adults?: number;
  children?: number;
};

export type SearchRequestBody = {
  query: string;
  attachment?: HeroChatAttachmentPayload;
  latitude?: number;
  longitude?: number;
  /** Structured trip shape from hero chat — preferred over LLM parse. */
  tripHints?: HeroTripSearchHints;
};

export type MakeSearchPassengers = {
  adults: number;
  children: number;
};

export type MakeSearchParsedData = {
  origin_airports: string[];
  /** First origin IATA — flat string for Make.com mapping (arrays often break). */
  origin_airport: string;
  destination_airport: string | null;
  departure_date: string;
  return_date: string;
  passengers: MakeSearchPassengers;
  trip_type?: "return" | "oneway" | "openjaw";
  return_from_airport?: string | null;
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
/** Initial wait before first status poll — Make Duffel loop + Gemini often needs 30–90s. */
export const MAKE_SEARCH_POLL_INITIAL_DELAY_MS = 5_000;
/** 36 × 2.5s ≈ 90s of polling after the initial delay (fail faster if Make never writes Data store). */
export const MAKE_SEARCH_POLL_MAX_ATTEMPTS = 36;

export function createMakeSearchId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `search-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Ensure each offer carries the hub we searched from (for multi-origin badges). */
export function tagMakeSearchFlightsWithOrigin(
  flights: MakeSearchFlight[],
  origin: string,
): MakeSearchFlight[] {
  const hub = origin.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(hub)) return flights;
  return flights.map((flight) => {
    if (flight.origin_iata && /^[A-Z]{3}$/.test(flight.origin_iata)) {
      return flight;
    }
    const route = parseMakeFlightRoute(flight.destinacija);
    const destinacija =
      route.from && route.to
        ? flight.destinacija
        : formatMakeRoute(hub, flight.destination_iata || route.to || "");
    return {
      ...flight,
      origin_iata: hub,
      destinacija: destinacija || flight.destinacija,
    };
  });
}

const NEAREST_AIRPORT_LIMIT = 4;
const NEAREST_AIRPORT_LOOKUP_TIMEOUT_MS = 6_000;
const IATAGEO_FANOUT_KM = 150;
const DEFAULT_TRIP_DAYS = 14;

const MONTH_PATTERN =
  "januarja|februarja|marca|aprila|maja|junija|julija|avgusta|septembra|oktobra|novembra|decembra|januar|februar|marec|april|maj|junij|julij|avgust|september|oktober|november|december|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|avg|aug|sep|okt|oct|nov|dec";

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  januar: 0,
  januarja: 0,
  january: 0,
  feb: 1,
  februar: 1,
  februarja: 1,
  february: 1,
  mar: 2,
  marec: 2,
  marca: 2,
  march: 2,
  apr: 3,
  april: 3,
  aprila: 3,
  maj: 4,
  maja: 4,
  may: 4,
  jun: 5,
  junij: 5,
  junija: 5,
  june: 5,
  jul: 6,
  julij: 6,
  julija: 6,
  july: 6,
  avg: 7,
  avgust: 7,
  avgusta: 7,
  aug: 7,
  august: 7,
  sep: 8,
  september: 8,
  septembra: 8,
  okt: 9,
  oktober: 9,
  oktobra: 9,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  novembra: 10,
  dec: 11,
  december: 11,
  decembra: 11,
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
  // Southern Thailand / Phuket before generic Thailand → Bangkok.
  // Include "jug tajske", genitive "phuketa", and južna/južno variants.
  {
    pattern:
      /\bphuket[aeu]?\b|\bhkt\b|\bju[gzž]n[aeo]?\s+tajsk|\bjug\s+tajsk|\bsouth(?:ern)?\s+thailand\b/i,
    iata: "HKT",
  },
  { pattern: /\bkuala lumpur\b|\bkul\b|\bmalezij[ao]\b|\bmalaysia\b/i, iata: "KUL" },
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
  { pattern: /\bbudimpešt[ao]\b|\bbudapest\b|\bbud\b/i, iata: "BUD" },
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

/** Slovenian/English tokens that look like IATA but are not airports. */
const FALSE_IATA_TOKENS = new Set([
  "LJU",
  "ZAG",
  "VIE",
  "VCE",
  "MXP",
  "BUD",
  "LET",
  "AND",
  "THE",
  "FOR",
  "ALI", // sl. "or"
  "STA", // sl. "are"
  "DNI", // sl. "days"
  "POT", // from "Potovanje v POT…" false match
  "CAE", // typo "cae" for "čas" (Columbia SC airport)
  "NAJ",
  "ZAJ",
  "TER",
  "OBI",
  "KOT",
  "SAM",
  "VSE",
  "BRE",
  "MED",
  "PRI",
  "OUR",
  "YOU",
  "ARE",
  "DAY",
  "THE",
  "IZA", // "iz a…" fragments
]);

/**
 * Destination clause from hero Make queries — before "iz …" origins / dates pollute
 * alias matching (e.g. "Potovanje v Manila … iz Milano (MXP)" must stay MNL, not MXP).
 */
function extractDestinationSegment(text: string): string | null {
  const m =
    text.match(
      /(?:potovanje|leti)\s+(?:v|na)\s+(.+?)(?=,\s*(?:termin|iz|tempo|proračun|budget|odhod|\d+\s*odras)|$)/i,
    ) ??
    text.match(
      /(?:trip|flights?)\s+to\s+(.+?)(?=,\s*(?:dates?|from|pace|budget|depart|\d+\s*adult)|$)/i,
    );
  const seg = m?.[1]?.trim();
  return seg && seg.length > 0 ? seg : null;
}

function destinationFromChunk(chunk: string): string | null {
  const upper = chunk.toUpperCase();

  // "Manila (MNL)" / "Phuket (HKT)" — trust the label IATA when not an origin false-token.
  const paren = upper.match(/\(([A-Z]{3})\)/);
  if (paren && !FALSE_IATA_TOKENS.has(paren[1]!)) return paren[1]!;

  // Do NOT match bare "V/TO/IN + XXX" — Slovenian "Potovanje v …" false-positives (e.g. POT).
  const explicitIata = upper.match(/\b(?:DESTINACIJ[AO]|DESTINATION)\s+([A-Z]{3})\b/);
  if (explicitIata && !FALSE_IATA_TOKENS.has(explicitIata[1]!)) return explicitIata[1]!;

  for (const alias of DESTINATION_ALIASES) {
    if (alias.pattern.test(chunk)) return alias.iata;
  }

  const looseIata = upper.match(/\b([A-Z]{3})\b/g);
  if (looseIata) {
    const found = looseIata.find((code) => !FALSE_IATA_TOKENS.has(code));
    if (found) return found;
  }

  return null;
}

export function parseMakeSearchDestination(text: string): string | null {
  const segment = extractDestinationSegment(text);
  if (segment) {
    const fromSegment = destinationFromChunk(segment);
    if (fromSegment) return fromSegment;
  }

  // Bare destination chips / short labels (no "Potovanje v …" wrapper).
  const fromFull = destinationFromChunk(text);
  if (fromFull) return fromFull;

  // Last resort: "→ XXX" only when not a date arrow ("okt → 19. nov").
  const upper = text.toUpperCase();
  const arrowMatch = upper.match(/\b(?:→|->)\s*([A-Z]{3})\b/);
  if (
    arrowMatch &&
    !FALSE_IATA_TOKENS.has(arrowMatch[1]!) &&
    !/\b(?:OKT|OCT|NOV|DEC|JAN|FEB|MAR|APR|MAJ|MAY|JUN|JUL|AVG|AUG|SEP)\b/.test(
      upper.slice(Math.max(0, (arrowMatch.index ?? 0) - 8), (arrowMatch.index ?? 0) + 12),
    )
  ) {
    return arrowMatch[1]!;
  }

  return null;
}

/** Prefer major hubs when user lists several origins (Make still uses first()). */
const ORIGIN_HUB_PRIORITY = ["VIE", "MXP", "BUD", "ZAG", "LJU", "MUC", "FRA", "VCE"] as const;

export function pickPrimaryOriginAirport(origins: string[]): string {
  if (origins.length === 0) return "LJU";
  if (origins.length === 1) return origins[0]!;
  for (const hub of ORIGIN_HUB_PRIORITY) {
    if (origins.includes(hub)) return hub;
  }
  return origins[0]!;
}

/** Departure airports mentioned in chat (Lj, Dunaj, Milano…). */
const ORIGIN_AIRPORT_ALIASES: Array<{ pattern: RegExp; iata: string }> = originAliasPatterns();

export function parseMakeSearchOriginAirports(text: string): string[] {
  const found: string[] = [];
  for (const alias of ORIGIN_AIRPORT_ALIASES) {
    if (!alias.pattern.test(text)) continue;
    if (!found.includes(alias.iata)) found.push(alias.iata);
  }
  // Origin picker labels: "Ljubljana (LJU) · Vienna (VIE)"
  for (const match of text.toUpperCase().matchAll(/\(([A-Z]{3})\)/g)) {
    const code = match[1]!;
    if (FALSE_IATA_TOKENS.has(code)) continue;
    if (!found.includes(code)) found.push(code);
  }
  return found.slice(0, Math.max(NEAREST_AIRPORT_LIMIT, 6));
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
  const destCode =
    destination_airport && /^[A-Z]{3}$/.test(destination_airport)
      ? destination_airport
      : null;

  const fromGeo = originAirports
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{3}$/.test(code));
  // "Phuket (HKT)" must not become an origin — parentheses IATA is the destination.
  const fromText = parseMakeSearchOriginAirports(text).filter(
    (code) => !destCode || code !== destCode,
  );
  // If the user named an origin (e.g. Munich/MUC), do NOT append GPS nearest hubs —
  // that was fanning Make out to 5 unrelated airports and hanging the search.
  // Geo is only a fallback when the chat never named an origin.
  const merged = (fromText.length > 0 ? fromText : fromGeo).filter(
    (code) => !destCode || code !== destCode,
  );
  // Allow a few more named origins from chat than geo-nearest (user often lists 5 hubs).
  const resolvedOrigins = merged.length > 0 ? merged.slice(0, 6) : ["LJU"];
  // Put the preferred hub first so Make `first(origin_airports)` / origin_airport hit a sensible airport.
  const primary = pickPrimaryOriginAirport(resolvedOrigins);
  let orderedOrigins = [
    primary,
    ...resolvedOrigins.filter((code) => code !== primary),
  ].filter((code) => !destCode || code !== destCode);
  // Never search origin === destination (Duffel 422 destination_must_be_different_from_origin).
  if (orderedOrigins.length === 0) {
    orderedOrigins = destCode === "LJU" ? ["VIE"] : ["LJU"];
  }

  const lower = text.toLowerCase();
  const openJawMatch = lower.match(
    /open-?jaw\s+return\s+from\s+([a-z]{3})\b|povratek\s+z\s+([a-z]{3})\b/i,
  );
  const returnFromHint = (openJawMatch?.[1] || openJawMatch?.[2] || "").toUpperCase();
  const trip_type: MakeSearchParsedData["trip_type"] = /one-?way|enosmerno|solo andata|solo ida|aller simple|nur hinflug/i.test(
    lower,
  )
    ? "oneway"
    : returnFromHint || /open-?jaw|different airport|drugega letališč/i.test(lower)
      ? "openjaw"
      : "return";

  return {
    origin_airports: orderedOrigins,
    origin_airport: orderedOrigins[0]!,
    destination_airport,
    departure_date: trip_type === "oneway" ? departure_date : departure_date,
    return_date: trip_type === "oneway" ? "" : return_date,
    passengers,
    trip_type,
    ...( /^[A-Z]{3}$/.test(returnFromHint) ? { return_from_airport: returnFromHint } : {}),
  };
}

/** Merge structured hero chat tripHints onto Make parse (hints win). */
export function applyHeroTripHints(
  parsed: MakeSearchParsedData,
  hints?: HeroTripSearchHints | null,
): MakeSearchParsedData {
  if (!hints) return parsed;
  const tripType = hints.tripType ?? parsed.trip_type ?? "return";
  const departDate = hints.departDate || parsed.departure_date;
  const returnDate =
    tripType === "oneway" ? "" : hints.returnDate || parsed.return_date || "";
  const returnFrom =
    tripType === "openjaw"
      ? (hints.returnFromIata || parsed.return_from_airport || "").toUpperCase()
      : undefined;
  const originIata = hints.originIata?.toUpperCase();
  const destinationIata = hints.destinationIata?.toUpperCase();

  let origin_airports = parsed.origin_airports;
  let origin_airport = parsed.origin_airport;
  if (originIata && /^[A-Z]{3}$/.test(originIata)) {
    origin_airport = originIata;
    origin_airports = [
      originIata,
      ...parsed.origin_airports.filter((code) => code !== originIata),
    ];
  }

  const adultsHint =
    typeof hints.adults === "number" && Number.isFinite(hints.adults)
      ? Math.min(9, Math.max(1, Math.round(hints.adults)))
      : null;
  const childrenHint =
    typeof hints.children === "number" && Number.isFinite(hints.children)
      ? Math.min(8, Math.max(0, Math.round(hints.children)))
      : null;

  return {
    ...parsed,
    origin_airports,
    origin_airport,
    destination_airport:
      destinationIata && /^[A-Z]{3}$/.test(destinationIata)
        ? destinationIata
        : parsed.destination_airport,
    departure_date: departDate,
    return_date: returnDate,
    trip_type: tripType,
    passengers: {
      adults: adultsHint ?? parsed.passengers.adults,
      children: childrenHint ?? parsed.passengers.children,
    },
    ...(returnFrom && /^[A-Z]{3}$/.test(returnFrom)
      ? { return_from_airport: returnFrom }
      : { return_from_airport: null }),
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

  let tripHints: HeroTripSearchHints | undefined;
  const hintsRaw = asRecord(record.tripHints);
  if (hintsRaw) {
    const tripTypeRaw = readString(hintsRaw, "tripType", "trip_type").toLowerCase();
    const tripType =
      tripTypeRaw === "oneway" || tripTypeRaw === "openjaw" || tripTypeRaw === "return"
        ? (tripTypeRaw as HeroTripSearchHints["tripType"])
        : undefined;
    const returnFromIata = readString(hintsRaw, "returnFromIata", "return_from_iata").toUpperCase();
    const departDate = readString(hintsRaw, "departDate", "depart_date");
    const returnDate = readString(hintsRaw, "returnDate", "return_date");
    const originIata = readString(hintsRaw, "originIata", "origin_iata").toUpperCase();
    const destinationIata = readString(
      hintsRaw,
      "destinationIata",
      "destination_iata",
    ).toUpperCase();
    const adultsRaw = hintsRaw.adults;
    const childrenRaw = hintsRaw.children;
    const adults =
      typeof adultsRaw === "number" && Number.isFinite(adultsRaw)
        ? Math.min(9, Math.max(1, Math.round(adultsRaw)))
        : undefined;
    const children =
      typeof childrenRaw === "number" && Number.isFinite(childrenRaw)
        ? Math.min(8, Math.max(0, Math.round(childrenRaw)))
        : undefined;
    tripHints = {
      ...(tripType ? { tripType } : {}),
      ...( /^[A-Z]{3}$/.test(returnFromIata) ? { returnFromIata } : {}),
      ...( /^\d{4}-\d{2}-\d{2}$/.test(departDate) ? { departDate } : {}),
      ...( /^\d{4}-\d{2}-\d{2}$/.test(returnDate) ? { returnDate } : {}),
      ...( /^[A-Z]{3}$/.test(originIata) ? { originIata } : {}),
      ...( /^[A-Z]{3}$/.test(destinationIata) ? { destinationIata } : {}),
      ...(adults != null ? { adults } : {}),
      ...(children != null ? { children } : {}),
    };
  }

  return {
    query: query.trim(),
    attachment,
    latitude,
    longitude,
    tripHints,
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
 * Make Webhook response templates often emit empty fields as `"offers":}`
 * when the Data store value is blank. Repair those before JSON.parse.
 */
export function repairMakeBrokenJson(text: string): string {
  let repaired = text.trim();
  repaired = repaired.replace(
    /("(?:offers|status|key|flights|error|message|data)"\s*:)\s*([,}])/gi,
    "$1 null$2",
  );
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  return repaired;
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

  const tryParse = (raw: string): unknown | null => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  };

  const parsed = tryParse(trimmed) ?? tryParse(repairMakeBrokenJson(trimmed));
  if (parsed !== null) {
    return { ok: true, data: parsed };
  }

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

function stripGeminiMarkdownJson(value: string): string {
  return value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** Flatten Make Data Store Get record shapes: { key, data: { offers, status } }. */
export function flattenMakeDataStoreRecord(data: unknown): Record<string, unknown> | null {
  const record = asRecord(data);
  if (!record) return null;

  const nested = asRecord(
    record.data ?? record.Data ?? record.record ?? record.Record ?? record.value,
  );

  if (!nested) return record;

  const key = readString(record, "key", "Key", "searchId", "search_id") || readString(nested, "key", "Key");
  const offers = nested.offers ?? nested.Offers ?? record.offers ?? record.Offers;
  const status = nested.status ?? nested.Status ?? record.status ?? record.Status;

  return {
    ...record,
    ...nested,
    ...(key ? { key } : {}),
    ...(offers !== undefined ? { offers } : {}),
    ...(status !== undefined ? { status } : {}),
  };
}

function tryParseJsonString(value: string): unknown | null {
  const candidates = [value.trim(), stripGeminiMarkdownJson(value)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** Unwrap Make Data Store / Gemini payloads where offers may be a JSON string. */
export function unwrapMakeSearchOffersPayload(data: unknown): unknown {
  if (parseMakeSearchFlights(data).length > 0) return data;

  const record = flattenMakeDataStoreRecord(data) ?? asRecord(data);
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
  if (data === 2 || data === "2") {
    return {
      status: "error",
      flights: [],
      error:
        "Status webhook vrača samo \"2\" — v Make popravi Webhook response Body (ne {{2}}, uporabi key/status/offers iz Data store).",
      raw: data,
    };
  }

  const payload = unwrapMakeSearchOffersPayload(data);
  const flights = parseMakeSearchFlights(payload);
  if (flights.length > 0) {
    return { status: "ready", flights, raw: data };
  }

  // Make instant webhooks return { message: "Accepted" } while the scenario still runs.
  if (isMakeAsyncAccepted(data)) {
    return { status: "pending", flights: [], raw: data };
  }

  const record = flattenMakeDataStoreRecord(data) ?? asRecord(data);
  const storeStatus = readString(record ?? {}, "status", "state", "Status").toLowerCase();
  if (storeStatus === "done" || storeStatus === "ready" || storeStatus === "complete") {
    return {
      status: "error",
      flights: [],
      error: "heroSearch.empty",
      raw: data,
    };
  }

  const errorMessage = record ? readString(record, "error", "detail") : "";
  if (record?.status === "error" || errorMessage) {
    return {
      status: "error",
      flights: [],
      // Never leak provider/infra names (Make, Duffel, HTTP) into the UI.
      error: "heroSearch.error",
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
  const timeoutMs = options?.timeoutMs ?? 100_000;
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
    // Duffel 422s if Make maps empty/garbage into slice origin/destination.
    const dest = parsedData.destination_airport?.trim().toUpperCase() ?? "";
    if (!/^[A-Z]{3}$/.test(dest) || FALSE_IATA_TOKENS.has(dest)) {
      return {
        ok: false,
        error: "heroSearch.destinationUnclear",
        status: 422,
      };
    }
    let origin = parsedData.origin_airport.trim().toUpperCase() || "LJU";
    const originAirports = (parsedData.origin_airports ?? [])
      .map((code) => code.trim().toUpperCase())
      .filter((code) => /^[A-Z]{3}$/.test(code) && code !== dest);
    if (origin === dest || FALSE_IATA_TOKENS.has(origin)) {
      origin = originAirports[0] || (dest === "LJU" ? "VIE" : "LJU");
    }
    if (origin === dest) {
      return {
        ok: false,
        error: "heroSearch.originSameAsDestination",
        status: 422,
      };
    }
    parsedData = {
      ...parsedData,
      destination_airport: dest,
      origin_airport: origin,
      origin_airports:
        originAirports.length > 0
          ? originAirports.includes(origin)
            ? originAirports
            : [origin, ...originAirports]
          : [origin],
    };
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
