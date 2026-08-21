import { describe, expect, it } from "vitest";
import {
  arrivalDaySlot,
  inboundArriveForDisplay,
  isAfternoonDeparture,
  isEveningDeparture,
  isLateArrival,
  isLateNightDeparture,
  isTightDeparture,
} from "@/lib/flightScheduling";
import { isoToHM } from "@/lib/flights.functions";

describe("isoToHM", () => {
  it("uses wall-clock local time from Duffel offset timestamps", () => {
    expect(isoToHM("2026-09-11T20:31:00-07:00")).toBe("20:31");
    expect(isoToHM("2026-07-11T01:35:00+07:00")).toBe("01:35");
    expect(isoToHM("2026-07-10T09:15:00+02:00")).toBe("09:15");
  });
});

describe("arrivalDaySlot", () => {
  it("puts evening landings in the evening block", () => {
    expect(
      arrivalDaySlot({
        outboundDepart: "10:00",
        outboundArrive: "20:31",
        outboundArriveDayOffset: 0,
      }),
    ).toBe("evening");
    expect(
      isLateArrival({
        outboundDepart: "10:00",
        outboundArrive: "20:31",
        outboundArriveDayOffset: 0,
      }),
    ).toBe(true);
  });

  it("puts red-eye next-day morning arrivals in the morning block", () => {
    expect(
      arrivalDaySlot({
        outboundDepart: "11:00",
        outboundArrive: "06:45",
        outboundArriveDayOffset: 1,
      }),
    ).toBe("morning");
  });

  it("puts midday landings in the afternoon block", () => {
    expect(
      arrivalDaySlot({
        outboundDepart: "08:00",
        outboundArrive: "14:30",
        outboundArriveDayOffset: 0,
      }),
    ).toBe("afternoon");
  });

  it("treats 16:35 departure as airport-only afternoon (no popoldan sights)", () => {
    const flights = {
      outboundDepart: "10:00",
      outboundArrive: "14:00",
      outboundArriveDayOffset: 0,
      inboundDepart: "16:35",
    };
    expect(isTightDeparture(flights)).toBe(false);
    expect(isAfternoonDeparture(flights)).toBe(true);
  });

  it("treats 20:00 departure as evening (airport by mid-afternoon)", () => {
    expect(
      isEveningDeparture({
        outboundDepart: "10:00",
        outboundArrive: "14:00",
        outboundArriveDayOffset: 0,
        inboundDepart: "20:00",
      }),
    ).toBe(true);
    expect(isAfternoonDeparture({
      outboundDepart: "10:00",
      outboundArrive: "14:00",
      outboundArriveDayOffset: 0,
      inboundDepart: "20:00",
    })).toBe(false);
    expect(isLateNightDeparture({
      outboundDepart: "10:00",
      outboundArrive: "14:00",
      outboundArriveDayOffset: 0,
      inboundDepart: "20:00",
    })).toBe(false);
  });

  it("treats 23:40 departure as late-night (full day, airport in evening)", () => {
    const flights = {
      outboundDepart: "10:00",
      outboundArrive: "14:00",
      outboundArriveDayOffset: 0,
      inboundDepart: "23:40",
    };
    expect(isLateNightDeparture(flights)).toBe(true);
    expect(isEveningDeparture(flights)).toBe(false);
  });

  it("puts morning landings in the morning block", () => {
    expect(
      arrivalDaySlot({
        outboundDepart: "22:00",
        outboundArrive: "09:15",
        outboundArriveDayOffset: 0,
      }),
    ).toBe("morning");
  });
});

describe("inboundArriveForDisplay", () => {
  it("drops a 15-minute same-clock arrival (broken long-haul stamp)", () => {
    expect(inboundArriveForDisplay("14:00", "14:15")).toBeUndefined();
  });

  it("keeps a real short-haul arrival", () => {
    expect(inboundArriveForDisplay("09:40", "11:10")).toBe("11:10");
  });

  it("drops a ~24h wrap (19:50 → 19:30)", () => {
    expect(inboundArriveForDisplay("19:50", "19:30")).toBeUndefined();
  });
});
