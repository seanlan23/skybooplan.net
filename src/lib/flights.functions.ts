import { createServerFn } from "@tanstack/react-start";
import {
  buildDuffelSlices,
  FlightSearchSchema,
  isClassicRoundTrip,
  isMultiCitySearch,
  type FlightSearchInput,
} from "@/lib/flightSearch";

/** Max offers pulled from Duffel per search (sorted by price server-side). */
export const DUFFEL_MAX_OFFERS = 20;

const DUFFEL_API_BASE = "https://api.duffel.com";
const DUFFEL_API_VERSION = "v2";
const DUFFEL_SUPPLIER_TIMEOUT_MS = 25_000;

/** Read Duffel token from env (trimmed). Supports legacy alias. */
export function getDuffelApiKey(): string | null {
  const raw = process.env.DUFFEL_API_KEY ?? process.env.DUFFEL_ACCESS_TOKEN ?? "";
  const token = raw.trim();
  return token.length > 0 ? token : null;
}

function duffelHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Duffel-Version": DUFFEL_API_VERSION,
  };
}

type DuffelApiErrorBody = {
  errors?: Array<{ title?: string; message?: string; code?: string }>;
};

async function readDuffelFailure(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as DuffelApiErrorBody;
    const first = json.errors?.[0];
    const detail = first?.message?.trim() || first?.title?.trim() || first?.code?.trim();
    if (detail) return detail;
  } catch {
    /* non-JSON body */
  }
  return text.trim().slice(0, 240) || `HTTP ${res.status}`;
}

export type FlightLeg = {
  from: string;
  to: string;
  depart: string;
  arrive: string;
  date: string;
  duration: string;
  durationMin: number;
  /** Calendar days between first departure and last arrival (0 = same day). */
  arriveDayOffset: number;
  stops: number;
  airline: string;
  airlineCode: string;
};

export type DuffelFlight = {
  id: string;
  airline: string;
  airlineCode: string;
  price: number;
  currency: string;
  /** Outbound connection count — used by stop filters. */
  stops: number;
  /** Total trip duration (all slices) for sorting/filtering. */
  duration: string;
  durationMin: number;
  outbound: FlightLeg;
  inbound?: FlightLeg;
  /** All slices (multi-city / open-jaw). */
  legs?: FlightLeg[];
  tripKind?: "oneway" | "roundtrip" | "multicity";
};

/**
 * Wall-clock HH:MM at the airport from a Duffel ISO timestamp.
 * Duffel uses local time at origin/destination with an explicit offset (e.g. -07:00 at LAX).
 * That matches the boarding pass / itinerary — not UTC.
 */
export function isoToHM(iso: string) {
  const wallClock = iso.match(/T(\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)?/);
  if (wallClock?.[1] && wallClock[2]) {
    return `${wallClock[1]}:${wallClock[2]}`;
  }

  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "00:00";
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}

function isoToDate(iso: string) {
  return iso.slice(0, 10);
}

export function durationIsoToMin(iso: string): number {
  const m = iso.match(/PT(?:(\d+)D)?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  const days = m[1] ? Number(m[1]) : 0;
  const hours = m[2] ? Number(m[2]) : 0;
  const minutes = m[3] ? Number(m[3]) : 0;
  return days * 1440 + hours * 60 + minutes;
}

export function durationToHuman(iso: string): string {
  const min = durationIsoToMin(iso);
  return minutesToHuman(min);
}

export function minutesToHuman(min: number): string {
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  const minutes = min % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(" ") || "0m";
}

/** Days between departure and arrival calendar dates (from ISO timestamps). */
export function dayOffsetFromIso(departIso: string, arriveIso: string): number {
  const depDate = departIso.slice(0, 10);
  const arrDate = arriveIso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depDate) || !/^\d{4}-\d{2}-\d{2}$/.test(arrDate)) return 0;
  const dep = new Date(`${depDate}T00:00:00Z`).getTime();
  const arr = new Date(`${arrDate}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((arr - dep) / 86_400_000));
}

type DuffelSlice = {
  origin: { iata_code: string };
  destination: { iata_code: string };
  duration: string;
  segments: Array<{
    departing_at: string;
    arriving_at: string;
    duration?: string;
    origin: { iata_code: string };
    destination: { iata_code: string };
    marketing_carrier: { name: string; iata_code: string };
  }>;
};

function resolveSliceDurationMin(slice: DuffelSlice): number {
  const fromApi = durationIsoToMin(slice.duration);
  if (fromApi > 0) return fromApi;

  const first = slice.segments[0];
  const last = slice.segments[slice.segments.length - 1];
  const dep = new Date(first.departing_at).getTime();
  const arr = new Date(last.arriving_at).getTime();
  if (Number.isFinite(dep) && Number.isFinite(arr) && arr > dep) {
    return Math.round((arr - dep) / 60_000);
  }

  let segmentSum = 0;
  for (const seg of slice.segments) {
    if (seg.duration) segmentSum += durationIsoToMin(seg.duration);
  }
  return segmentSum;
}

type DuffelOffer = {
  id: string;
  total_amount: string;
  total_currency: string;
  owner: { name: string; iata_code: string };
  slices: DuffelSlice[];
};

function mapSliceToLeg(slice: DuffelSlice): FlightLeg {
  const first = slice.segments[0];
  const last = slice.segments[slice.segments.length - 1];
  const carrier = first.marketing_carrier;
  const durationMin = resolveSliceDurationMin(slice);

  return {
    from: first.origin.iata_code,
    to: last.destination.iata_code,
    depart: isoToHM(first.departing_at),
    arrive: isoToHM(last.arriving_at),
    date: isoToDate(first.departing_at),
    duration: minutesToHuman(durationMin),
    durationMin,
    arriveDayOffset: dayOffsetFromIso(first.departing_at, last.arriving_at),
    stops: Math.max(0, slice.segments.length - 1),
    airline: carrier.name,
    airlineCode: carrier.iata_code,
  };
}

/** Map one Duffel offer into a flight card (one-way, round-trip, or multi-city). */
export function mapDuffelOfferToFlight(offer: DuffelOffer): DuffelFlight | null {
  const legs = offer.slices
    .filter((s) => s.segments?.length)
    .map(mapSliceToLeg);
  if (legs.length === 0) return null;

  const outbound = legs[0]!;
  const inbound = legs.length > 1 ? legs[legs.length - 1] : undefined;
  const durationMin = legs.reduce((sum, leg) => sum + leg.durationMin, 0);
  const roundtrip = inbound ? isClassicRoundTrip(outbound, inbound) : false;
  const tripKind =
    legs.length > 2 ? "multicity" : roundtrip ? "roundtrip" : legs.length === 2 ? "multicity" : "oneway";

  return {
    id: offer.id,
    airline: offer.owner.name,
    airlineCode: offer.owner.iata_code,
    price: Math.round(parseFloat(offer.total_amount)),
    currency: offer.total_currency,
    stops: outbound.stops,
    duration: minutesToHuman(durationMin),
    durationMin,
    outbound,
    inbound,
    legs,
    tripKind,
  };
}

/** Keep offers that match the requested trip shape (return / multi-city / one-way). */
export function filterFlightsForTripType(
  flights: DuffelFlight[],
  data: FlightSearchInput,
): { flights: DuffelFlight[]; error: string | null } {
  const wantsMulti = isMultiCitySearch(data);
  const wantsReturn = data.tripType === "return" || Boolean(data.returnDate?.trim());

  if (wantsMulti) {
    const multi = flights.filter((f) => (f.legs?.length ?? 0) >= 2);
    if (multi.length === 0) {
      return { flights: [], error: "error.multicityUnavailable" };
    }
    return { flights: multi, error: null };
  }

  if (wantsReturn) {
    const withReturn = flights.filter((f) => Boolean(f.inbound));
    if (withReturn.length === 0) {
      return { flights: [], error: "error.roundTripUnavailable" };
    }
    return { flights: withReturn, error: null };
  }

  return { flights, error: null };
}

async function createDuffelOfferRequest(
  token: string,
  slices: ReturnType<typeof buildDuffelSlices>,
  passengers: Array<{ type: "adult" }>,
  cabinClass: string,
): Promise<{ offerRequestId: string } | { error: string }> {
  const url = `${DUFFEL_API_BASE}/air/offer_requests?return_offers=false&supplier_timeout=${DUFFEL_SUPPLIER_TIMEOUT_MS}`;
  const createRes = await fetch(url, {
    method: "POST",
    headers: duffelHeaders(token),
    body: JSON.stringify({
      data: {
        slices,
        passengers,
        cabin_class: cabinClass,
      },
    }),
  });

  if (!createRes.ok) {
    const detail = await readDuffelFailure(createRes);
    console.error("Duffel offer_requests error:", createRes.status, detail);
    return { error: `error.duffelApi:${createRes.status}` };
  }

  const json = (await createRes.json()) as { data?: { id?: string } };
  const offerRequestId = json.data?.id?.trim();
  if (!offerRequestId) {
    console.error("Duffel offer_requests missing id:", json);
    return { error: "error.flightsUnavailable" };
  }

  return { offerRequestId };
}

async function listDuffelOffers(
  token: string,
  offerRequestId: string,
  limit = DUFFEL_MAX_OFFERS,
): Promise<{ offers: DuffelOffer[] } | { error: string }> {
  const url = new URL(`${DUFFEL_API_BASE}/air/offers`);
  url.searchParams.set("offer_request_id", offerRequestId);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "total_amount");

  const listRes = await fetch(url.toString(), {
    method: "GET",
    headers: duffelHeaders(token),
  });

  if (!listRes.ok) {
    const detail = await readDuffelFailure(listRes);
    console.error("Duffel list offers error:", listRes.status, detail);
    return { error: `error.duffelApi:${listRes.status}` };
  }

  const json = (await listRes.json()) as { data?: DuffelOffer[] };
  return { offers: json.data ?? [] };
}

export const searchFlights = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => FlightSearchSchema.parse(data))
  .handler(async ({ data }): Promise<{ flights: DuffelFlight[]; error: string | null }> => {
    const token = getDuffelApiKey();
    if (!token) {
      console.error("[Duffel] DUFFEL_API_KEY is missing or empty in server environment");
      return { flights: [], error: "error.duffelNotConfigured" };
    }

    const slices = buildDuffelSlices(data);
    const passengers = Array.from({ length: data.pax }, () => ({ type: "adult" as const }));
    const cabinClass = data.cabinClass ?? "economy";

    try {
      const created = await createDuffelOfferRequest(token, slices, passengers, cabinClass);
      if ("error" in created) {
        return { flights: [], error: created.error };
      }

      const listed = await listDuffelOffers(token, created.offerRequestId);
      if ("error" in listed) {
        return { flights: [], error: listed.error };
      }

      let flights = listed.offers
        .map(mapDuffelOfferToFlight)
        .filter((flight): flight is DuffelFlight => flight !== null);

      const filtered = filterFlightsForTripType(flights, data);
      if (filtered.error) {
        return { flights: [], error: filtered.error };
      }
      flights = filtered.flights;

      flights.sort((a, b) => a.price - b.price || a.durationMin - b.durationMin);
      return { flights, error: null };
    } catch (err) {
      console.error("Duffel fetch failed:", err);
      return { flights: [], error: "error.flightsUnavailable" };
    }
  });
