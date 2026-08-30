import { addDays } from "@/lib/dateUtils";
import type { TripFlightContext } from "@/lib/flightScheduling";
import { inferArriveDayOffset, type MakeSearchFlight } from "@/lib/makeSearch";

export type HotelStayDates = {
  checkIn: string;
  checkOut?: string;
};

function isoDay(value?: string | null): string {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? "";
}

/**
 * Hotel check-in is the local calendar date the outbound flight lands —
 * never the home-airport ticket date.
 */
export function hotelCheckInFromOutbound(opts: {
  arriveIso?: string | null;
  arriveDate?: string | null;
  departDate?: string | null;
  arriveDayOffset?: number | null;
  departTime?: string | null;
  arriveTime?: string | null;
}): string | undefined {
  const fromArrive = isoDay(opts.arriveIso) || isoDay(opts.arriveDate);
  if (fromArrive) return fromArrive;
  const depart = isoDay(opts.departDate);
  if (!depart) return undefined;
  const offset = inferArriveDayOffset(
    opts.departTime ?? "",
    opts.arriveTime ?? "",
    opts.arriveDayOffset ?? undefined,
  );
  return addDays(depart, offset);
}

/** Hotel check-out is the inbound takeoff date from the destination. */
export function hotelCheckOutFromInbound(opts: {
  inboundDepartIso?: string | null;
  inboundDepartDate?: string | null;
  returnDate?: string | null;
}): string | undefined {
  return (
    isoDay(opts.inboundDepartIso) ||
    isoDay(opts.inboundDepartDate) ||
    isoDay(opts.returnDate) ||
    undefined
  );
}

export function hotelStayDatesFromFlight(opts: {
  departDate?: string | null;
  returnDate?: string | null;
  outboundArriveIso?: string | null;
  outboundArriveDate?: string | null;
  outboundArriveDayOffset?: number | null;
  outboundDepart?: string | null;
  outboundArrive?: string | null;
  inboundDepartIso?: string | null;
  inboundDepartDate?: string | null;
}): HotelStayDates | null {
  const checkIn = hotelCheckInFromOutbound({
    arriveIso: opts.outboundArriveIso,
    arriveDate: opts.outboundArriveDate,
    departDate: opts.departDate,
    arriveDayOffset: opts.outboundArriveDayOffset,
    departTime: opts.outboundDepart,
    arriveTime: opts.outboundArrive,
  });
  if (!checkIn) return null;
  const checkOut = hotelCheckOutFromInbound({
    inboundDepartIso: opts.inboundDepartIso,
    inboundDepartDate: opts.inboundDepartDate,
    returnDate: opts.returnDate,
  });
  return checkOut ? { checkIn, checkOut } : { checkIn };
}

export function hotelStayDatesFromContext(
  flights: TripFlightContext | null | undefined,
  ticket: { departDate?: string | null; returnDate?: string | null },
): HotelStayDates | null {
  return hotelStayDatesFromFlight({
    departDate: ticket.departDate,
    returnDate: ticket.returnDate,
    outboundArriveDate: flights?.outboundArriveDate,
    outboundArriveDayOffset: flights?.outboundArriveDayOffset,
    outboundDepart: flights?.outboundDepart,
    outboundArrive: flights?.outboundArrive,
    inboundDepartDate: flights?.inboundDepartDate,
  });
}

export function hotelStayDatesFromMakeFlight(
  flight: Pick<
    MakeSearchFlight,
    | "depart_date"
    | "return_date"
    | "odhod"
    | "povratek"
    | "outbound_arrive_iso"
    | "inbound_depart_iso"
    | "outbound_arrive_day_offset"
    | "outbound_depart"
    | "outbound_arrive"
  >,
): HotelStayDates | null {
  return hotelStayDatesFromFlight({
    departDate: isoDay(flight.depart_date) || isoDay(flight.odhod),
    returnDate: isoDay(flight.return_date) || isoDay(flight.povratek),
    outboundArriveIso: flight.outbound_arrive_iso,
    outboundArriveDayOffset: flight.outbound_arrive_day_offset,
    outboundDepart: flight.outbound_depart,
    outboundArrive: flight.outbound_arrive,
    inboundDepartIso: flight.inbound_depart_iso,
  });
}

export function stampHotelStayOnFlightContext(
  flights: TripFlightContext,
  ticket: {
    departDate?: string | null;
    returnDate?: string | null;
    outboundArriveIso?: string | null;
    inboundDepartIso?: string | null;
  },
): TripFlightContext {
  const stay = hotelStayDatesFromFlight({
    departDate: ticket.departDate,
    returnDate: ticket.returnDate,
    outboundArriveIso: ticket.outboundArriveIso,
    outboundArriveDate: flights.outboundArriveDate,
    outboundArriveDayOffset: flights.outboundArriveDayOffset,
    outboundDepart: flights.outboundDepart,
    outboundArrive: flights.outboundArrive,
    inboundDepartIso: ticket.inboundDepartIso,
    inboundDepartDate: flights.inboundDepartDate,
  });
  if (!stay) return flights;
  return {
    ...flights,
    outboundArriveDate: stay.checkIn,
    ...(stay.checkOut ? { inboundDepartDate: stay.checkOut } : {}),
  };
}
