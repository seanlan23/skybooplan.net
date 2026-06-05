import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SearchSchema = z.object({
  from: z.string().min(3).max(3).regex(/^[A-Z]{3}$/, "IATA koda (3 črke)"),
  to: z.string().min(3).max(3).regex(/^[A-Z]{3}$/),
  departDate: z.string().min(10).max(10),
  returnDate: z.string().min(10).max(10).optional().or(z.literal("")),
  pax: z.number().min(1).max(9),
  cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).optional(),
});

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
};

export function isoToHM(iso: string) {
  const localTimeMatch = iso.match(/T(\d{2}:\d{2})/);
  if (localTimeMatch?.[1]) return localTimeMatch[1];

  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
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

/** Map one Duffel offer into a distinct round-trip / one-way flight card. */
export function mapDuffelOfferToFlight(offer: DuffelOffer): DuffelFlight | null {
  const outSlice = offer.slices[0];
  if (!outSlice?.segments?.length) return null;

  const outbound = mapSliceToLeg(outSlice);
  const backSlice = offer.slices[1];
  const inbound = backSlice?.segments?.length ? mapSliceToLeg(backSlice) : undefined;
  const durationMin = outbound.durationMin + (inbound?.durationMin ?? 0);

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
  };
}

export const searchFlights = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SearchSchema.parse(data))
  .handler(async ({ data }): Promise<{ flights: DuffelFlight[]; error: string | null }> => {
    const token = process.env.DUFFEL_API_KEY;
    if (!token) return { flights: [], error: "error.duffelNotConfigured" };

    const slices = [
      { origin: data.from, destination: data.to, departure_date: data.departDate },
    ];
    if (data.returnDate) {
      slices.push({ origin: data.to, destination: data.from, departure_date: data.returnDate });
    }

    const passengers = Array.from({ length: data.pax }, () => ({ type: "adult" as const }));

    try {
      const createRes = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Duffel-Version": "v2",
        },
        body: JSON.stringify({
          data: {
            slices,
            passengers,
            cabin_class: data.cabinClass ?? "economy",
          },
        }),
      });

      if (!createRes.ok) {
        const text = await createRes.text();
        console.error("Duffel offer_requests error:", createRes.status, text);
        return { flights: [], error: `error.duffelApi:${createRes.status}` };
      }

      const json = (await createRes.json()) as { data: { offers: DuffelOffer[] } };
      const offers = (json.data.offers ?? []).slice(0, 12);

      const flights = offers
        .map(mapDuffelOfferToFlight)
        .filter((flight): flight is DuffelFlight => flight !== null);

      flights.sort((a, b) => a.price - b.price || a.durationMin - b.durationMin);
      return { flights, error: null };
    } catch (err) {
      console.error("Duffel fetch failed:", err);
      return { flights: [], error: "error.flightsUnavailable" };
    }
  });
