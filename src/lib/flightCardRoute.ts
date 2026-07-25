import type { MakeSearchFlight } from "@/lib/makeSearch";
import { parseMakeFlightRoute } from "@/lib/makeSearch";

/** Resolve outbound + return IATA display for FlightCard (open-jaw aware). */
export function resolveMakeFlightLegAirports(flight: MakeSearchFlight): {
  from: string;
  to: string;
  returnFrom: string;
  returnTo: string;
  hasReturn: boolean;
} {
  const route = parseMakeFlightRoute(flight.destinacija);
  const from = flight.origin_iata || route.from || "—";
  const to = flight.destination_iata || route.to || "—";
  const hasReturn = Boolean(flight.povratek || flight.inbound_depart);
  const returnFrom = hasReturn
    ? flight.inbound_origin_iata || to || "—"
    : "—";
  const returnTo = hasReturn
    ? flight.inbound_destination_iata || from || "—"
    : "—";
  return { from, to, returnFrom, returnTo, hasReturn };
}
