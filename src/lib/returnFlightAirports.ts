import type { AiTripPlan, ReturnFlightEu } from "@/lib/aiPlan.functions";
import { DESTINATION_BY_IATA, lookupDestination } from "@/lib/destinationCoords";
import { sanitizeReturnFlightSummary } from "@/lib/returnFlightSummary";

export type ReturnFlightAirportOpts = {
  destinationIata?: string;
  originIata?: string;
  returnFromIata?: string;
  language?: string;
};

/** Ticket origin for the inbound leg: open-jaw hub, else the destination IATA. */
export function canonicalReturnFromIata(opts: ReturnFlightAirportOpts): string {
  const hinted = (opts.returnFromIata ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(hinted) && DESTINATION_BY_IATA[hinted]) return hinted;
  const dest = (opts.destinationIata ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(dest) && DESTINATION_BY_IATA[dest]) return dest;
  return dest;
}

export function extractIataToken(value: string | undefined): string {
  const raw = (value ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw) && DESTINATION_BY_IATA[raw]) return raw;
  const m = raw.match(/\b([A-Z]{3})\b/);
  if (m?.[1] && DESTINATION_BY_IATA[m[1]]) return m[1];
  return "";
}

/**
 * Gemini sometimes emits a foreign hub (BUD for Ubud/Bali) as from_airport.
 * The inbound origin must be the destination / open-jaw return IATA.
 */
export function sanitizeReturnFromAirport(
  fromAirport: string | undefined,
  opts: ReturnFlightAirportOpts,
): string {
  const allowed = canonicalReturnFromIata(opts);
  const origin = (opts.originIata ?? "").trim().toUpperCase();
  const extracted = extractIataToken(fromAirport);
  if (!allowed) return extracted || (fromAirport ?? "").trim();
  if (extracted === allowed) return allowed;
  if (extracted === origin) return allowed;
  return allowed;
}

export function sanitizeReturnToAirport(
  toAirport: string | undefined,
  originIata?: string,
): string {
  const origin = (originIata ?? "").trim().toUpperCase();
  const extracted = extractIataToken(toAirport);
  if (origin && DESTINATION_BY_IATA[origin]) {
    if (extracted === origin) return origin;
    const toMeta = extracted ? lookupDestination(extracted) : null;
    const originMeta = lookupDestination(origin);
    if (!extracted) return origin;
    if (toMeta && originMeta && toMeta.country !== originMeta.country) return origin;
  }
  return extracted || (toAirport ?? "").trim() || origin;
}

export function sanitizeReturnFlightEu(
  rf: ReturnFlightEu | undefined,
  opts: ReturnFlightAirportOpts,
): ReturnFlightEu | undefined {
  if (!rf) return rf;
  const fromAirport = sanitizeReturnFromAirport(rf.fromAirport, opts);
  const toAirport = sanitizeReturnToAirport(rf.toAirport, opts.originIata);
  return {
    ...rf,
    fromAirport,
    toAirport,
    summary: sanitizeReturnFlightSummary(rf.summary, {
      fromIata: fromAirport,
      toIata: toAirport,
      language: opts.language,
      depart: rf.departureTime,
      arrive: rf.arrivalTimeEu,
    }),
  };
}

export function sanitizePlanReturnFlight(plan: AiTripPlan, language?: string): void {
  if (!plan.returnFlightEu || plan.groundTransportMode) return;
  const next = sanitizeReturnFlightEu(plan.returnFlightEu, {
    destinationIata: plan.destinationIata,
    originIata: plan.originIata,
    returnFromIata: (plan as { returnFromIata?: string }).returnFromIata,
    language: language ?? plan.contentLanguage,
  });
  if (next) plan.returnFlightEu = next;
}
