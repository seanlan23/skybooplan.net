import { describe, expect, it } from "vitest";
import {
  hotelStayDatesFromContext,
  hotelStayDatesFromFlight,
  hotelStayDatesFromMakeFlight,
  stampHotelStayOnFlightContext,
} from "@/lib/hotelStayDates";
import type { TripFlightContext } from "@/lib/flightScheduling";
import type { MakeSearchFlight } from "@/lib/makeSearch";

const overnightClocks: TripFlightContext = {
  outboundDepart: "19:40",
  outboundArrive: "10:10",
  outboundArriveDayOffset: 1,
  inboundDepart: "09:25",
};

describe("hotelStayDatesFromFlight", () => {
  it("uses destination arrival date, not home-airport depart (LJU 26 Oct 19:40 → HKT 27 Oct)", () => {
    expect(
      hotelStayDatesFromFlight({
        departDate: "2026-10-26",
        returnDate: "2026-11-06",
        outboundDepart: "19:40",
        outboundArrive: "10:10",
        outboundArriveDayOffset: 1,
      }),
    ).toEqual({ checkIn: "2026-10-27", checkOut: "2026-11-06" });
  });

  it("prefers outbound_arrive_iso over a ticket date or offset", () => {
    expect(
      hotelStayDatesFromFlight({
        departDate: "2026-10-26",
        returnDate: "2026-11-06",
        outboundArriveIso: "2026-10-27T10:10:00+07:00",
        outboundArriveDayOffset: 0,
        outboundDepart: "19:40",
        outboundArrive: "10:10",
      }),
    ).toEqual({ checkIn: "2026-10-27", checkOut: "2026-11-06" });
  });

  it("keeps same-day European arrival on the ticket date", () => {
    expect(
      hotelStayDatesFromFlight({
        departDate: "2026-09-19",
        returnDate: "2026-09-26",
        outboundDepart: "10:00",
        outboundArrive: "14:20",
        outboundArriveDayOffset: 0,
      }),
    ).toEqual({ checkIn: "2026-09-19", checkOut: "2026-09-26" });
  });

  it("infers +1 from overnight clocks when the stored offset is 0", () => {
    expect(
      hotelStayDatesFromFlight({
        departDate: "2026-10-26",
        returnDate: "2026-11-06",
        outboundDepart: "19:40",
        outboundArrive: "10:10",
        outboundArriveDayOffset: 0,
      }),
    ).toEqual({ checkIn: "2026-10-27", checkOut: "2026-11-06" });
  });

  it("uses inbound_depart_iso for check-out when present", () => {
    expect(
      hotelStayDatesFromFlight({
        departDate: "2026-10-26",
        returnDate: "2026-11-10",
        outboundArriveIso: "2026-10-27T10:10:00+07:00",
        inboundDepartIso: "2026-11-06T09:25:00+07:00",
      }),
    ).toEqual({ checkIn: "2026-10-27", checkOut: "2026-11-06" });
  });
});

describe("hotelStayDatesFromContext", () => {
  it("shifts check-in by the stamped arrival date or offset", () => {
    expect(
      hotelStayDatesFromContext(overnightClocks, {
        departDate: "2026-10-26",
        returnDate: "2026-11-06",
      }),
    ).toEqual({ checkIn: "2026-10-27", checkOut: "2026-11-06" });
  });

  it("prefers persisted destination calendar dates", () => {
    expect(
      hotelStayDatesFromContext(
        {
          ...overnightClocks,
          outboundArriveDate: "2026-10-27",
          inboundDepartDate: "2026-11-06",
        },
        { departDate: "2026-10-26", returnDate: "2026-11-10" },
      ),
    ).toEqual({ checkIn: "2026-10-27", checkOut: "2026-11-06" });
  });
});

describe("hotelStayDatesFromMakeFlight", () => {
  it("reads arrival ISO from a Duffel-style offer", () => {
    const flight = {
      depart_date: "2026-10-26",
      return_date: "2026-11-06",
      outbound_depart: "19:40",
      outbound_arrive: "10:10",
      outbound_arrive_iso: "2026-10-27T10:10:00+07:00",
      inbound_depart_iso: "2026-11-06T09:25:00+07:00",
    } as MakeSearchFlight;
    expect(hotelStayDatesFromMakeFlight(flight)).toEqual({
      checkIn: "2026-10-27",
      checkOut: "2026-11-06",
    });
  });
});

describe("stampHotelStayOnFlightContext", () => {
  it("persists hotel stay dates on the flight context", () => {
    const stamped = stampHotelStayOnFlightContext(overnightClocks, {
      departDate: "2026-10-26",
      returnDate: "2026-11-06",
      outboundArriveIso: "2026-10-27T10:10:00+07:00",
    });
    expect(stamped.outboundArriveDate).toBe("2026-10-27");
    expect(stamped.inboundDepartDate).toBe("2026-11-06");
    expect(stamped.outboundArriveDayOffset).toBe(1);
  });
});
