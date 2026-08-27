import { describe, expect, it } from "vitest";
import {
  arrivalDaySlot,
  inboundArriveForDisplay,
  lastDayArriveForDisplay,
  isLeakedOriginMorningArrive,
  earliestDestLocalMinutes,
  isImplausibleLongHaulArrive,
  isAfternoonDeparture,
  isEarlyDeparture,
  isEveningDeparture,
  isLateArrival,
  isLateNightDeparture,
  isOvernightDeparture,
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

  it("treats 01:30 as overnight, not a morning tight departure", () => {
    const flights = {
      outboundDepart: "11:55",
      outboundArrive: "11:25",
      outboundArriveDayOffset: 1,
      inboundDepart: "01:30",
    };
    expect(isOvernightDeparture(flights)).toBe(true);
    expect(isEarlyDeparture(flights)).toBe(false);
    expect(isTightDeparture(flights)).toBe(false);
    expect(isLateNightDeparture(flights)).toBe(false);
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

describe("lastDayArriveForDisplay", () => {
  it("drops a leaked MUC 06:45 morning clock on an NRT morning departure", () => {
    expect(lastDayArriveForDisplay("10:50", "06:45")).toBeUndefined();
    expect(isLeakedOriginMorningArrive("10:50", "06:45")).toBe(true);
  });

  it("keeps a same-day Europe afternoon landing from Narita", () => {
    expect(lastDayArriveForDisplay("10:50", "16:20")).toBe("16:20");
  });

  it("keeps an overnight HKT afternoon departure landing next morning", () => {
    expect(lastDayArriveForDisplay("15:30", "06:00")).toBe("06:00");
    expect(isLeakedOriginMorningArrive("15:30", "06:00")).toBe(false);
  });
});

describe("long-haul physics", () => {
  const LJU = { lat: 46.22, lng: 14.46 };
  const BKK = { lat: 13.69, lng: 100.75 };

  it("rejects hotel 08:55 after a 06:40 Europe departure to Bangkok", () => {
    expect(isImplausibleLongHaulArrive(6 * 60 + 40, 8 * 60 + 55, LJU, BKK)).toBe(true);
    expect(earliestDestLocalMinutes(6 * 60 + 40, LJU, BKK)).toBeGreaterThan(18 * 60);
  });

  it("allows an evening landing the same calendar day", () => {
    expect(isImplausibleLongHaulArrive(6 * 60 + 40, 22 * 60 + 30, LJU, BKK)).toBe(false);
  });
});
