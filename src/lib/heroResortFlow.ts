import type { AiPlannerContext } from "@/components/AiPlannerPreview";
import type { HeroChatCollected, HeroChatMode } from "@/lib/heroChatFlow";
import {
  inferArriveDayOffset,
  parseMakeFlightRoute,
  selectTopMakeSearchFlights,
  type MakeSearchFlight,
} from "@/lib/makeSearch";
import { makeFlightStopContext } from "@/lib/flightTransitGuide";
import { stampHotelStayOnFlightContext } from "@/lib/hotelStayDates";
import { heroFlightPartyTotalEur } from "@/lib/tripCostSummary";
import { normalizeTravelStyle } from "@/lib/travelStyle";

export function isResortPackageSearch(
  collected: Pick<HeroChatCollected, "travelStyle">,
  mode: HeroChatMode,
): boolean {
  if (mode !== "all") return false;
  return normalizeTravelStyle(collected.travelStyle) === "resort";
}

function isReturnFlight(flight: MakeSearchFlight): boolean {
  return Boolean(flight.inbound_depart || flight.return_date || flight.povratek);
}

/** Cheapest/best return in the already-ranked hero list — no extra user pick. */
export function pickResortBaseFlight(flights: MakeSearchFlight[]): MakeSearchFlight | null {
  if (flights.length === 0) return null;
  const ranked = selectTopMakeSearchFlights(flights);
  const pool = ranked.length ? ranked : flights;
  return pool.find(isReturnFlight) ?? pool[0] ?? null;
}

function isoDay(value?: string): string {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
}

/** Stay dates from the selected flight card — never the flexible chat window. */
export function stayDatesFromSelectedFlight(
  flight: Pick<
    MakeSearchFlight,
    | "depart_date"
    | "return_date"
    | "odhod"
    | "povratek"
    | "outbound_depart_iso"
    | "inbound_depart_iso"
  >,
  fallback?: { departDate?: string; returnDate?: string },
): { departDate: string; returnDate?: string } {
  const departDate =
    isoDay(flight.depart_date) ||
    isoDay(flight.odhod) ||
    isoDay(flight.outbound_depart_iso) ||
    isoDay(fallback?.departDate);
  const returnDate =
    isoDay(flight.return_date) ||
    isoDay(flight.povratek) ||
    isoDay(flight.inbound_depart_iso) ||
    isoDay(fallback?.returnDate) ||
    undefined;
  return { departDate, returnDate };
}

export function plannerContextFromHeroFlight(
  flight: MakeSearchFlight,
  base: AiPlannerContext & { language?: string },
): AiPlannerContext & { language?: string } {
  const route = parseMakeFlightRoute(flight.destinacija);
  const from = flight.origin_iata || route.from || base.from || "LJU";
  const to = flight.destination_iata || route.to || base.to || "";
  const isOneWay = !flight.inbound_depart && !flight.povratek && !flight.return_date;
  const { departDate, returnDate } = stayDatesFromSelectedFlight(flight, {
    departDate: base.departDate,
    returnDate: isOneWay ? undefined : base.returnDate,
  });
  const returnFromIata =
    flight.inbound_origin_iata ||
    base.returnFromIata ||
    undefined;
  const flights =
    flight.outbound_depart && flight.outbound_arrive
      ? stampHotelStayOnFlightContext(
          {
            outboundDepart: flight.outbound_depart,
            outboundArrive: flight.outbound_arrive,
            outboundArriveDayOffset: inferArriveDayOffset(
              flight.outbound_depart,
              flight.outbound_arrive,
              flight.outbound_arrive_day_offset,
            ),
            ...(!isOneWay && flight.inbound_depart ? { inboundDepart: flight.inbound_depart } : {}),
            ...(!isOneWay && flight.inbound_arrive ? { inboundArrive: flight.inbound_arrive } : {}),
            ...makeFlightStopContext(flight, !isOneWay),
          },
          {
            departDate,
            returnDate,
            outboundArriveIso: flight.outbound_arrive_iso,
            inboundDepartIso: flight.inbound_depart_iso,
          },
        )
      : base.flights;
  const partyForPrice = Math.max(
    1,
    base.pax || (base.adults || 0) + (base.childrenAges?.length ?? 0) || 1,
  );
  return {
    ...base,
    from,
    to,
    departDate: departDate || base.departDate,
    returnDate: returnDate || undefined,
    ...(returnFromIata && returnFromIata !== to ? { returnFromIata } : {}),
    flights,
    flightTotalEur: heroFlightPartyTotalEur(flight.cena_eur, partyForPrice, flight.price_basis),
  };
}
