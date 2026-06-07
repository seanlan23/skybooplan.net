import { describe, expect, it } from "vitest";
import {
  arrivalDaySlot,
  arrivalTripDay,
  isInFlightTripDay,
  isLateArrival,
  isRedEyeArrival,
  isTightArrivalDay,
} from "@/lib/flightScheduling";

describe("midday +1d arrival (EWR 13:15)", () => {
  const flights = {
    outboundDepart: "11:00",
    outboundArrive: "13:15",
    outboundArriveDayOffset: 1,
  };

  it("is not treated as late arrival", () => {
    expect(isRedEyeArrival(flights)).toBe(false);
    expect(isLateArrival(flights)).toBe(false);
  });

  it("lands in afternoon slot", () => {
    expect(arrivalDaySlot(flights)).toBe("afternoon");
  });

  it("is tight arrival — no pre-landing fillers", () => {
    expect(isTightArrivalDay(flights)).toBe(true);
  });
});

describe("red-eye +1d morning arrival", () => {
  const flights = {
    outboundDepart: "22:00",
    outboundArrive: "06:45",
    outboundArriveDayOffset: 1,
  };

  it("lands morning slot — recovery yes, but not evening-only day", () => {
    expect(isRedEyeArrival(flights)).toBe(true);
    expect(isLateArrival(flights)).toBe(false);
    expect(arrivalDaySlot(flights)).toBe("morning");
    expect(arrivalTripDay(flights)).toBe(2);
    expect(isTightArrivalDay(flights)).toBe(true);
  });
});

describe("afternoon +1d arrival (BKK 15:25)", () => {
  const flights = {
    outboundDepart: "11:00",
    outboundArrive: "15:25",
    outboundArriveDayOffset: 1,
  };

  it("is tight arrival with afternoon slot", () => {
    expect(arrivalTripDay(flights)).toBe(2);
    expect(arrivalDaySlot(flights)).toBe("afternoon");
    expect(isLateArrival(flights)).toBe(false);
    expect(isTightArrivalDay(flights)).toBe(true);
  });
});

describe("+2d morning arrival (long-haul)", () => {
  const flights = {
    outboundDepart: "10:00",
    outboundArrive: "06:05",
    outboundArriveDayOffset: 2,
  };

  it("arrival is trip day 3, not day 1", () => {
    expect(arrivalTripDay(flights)).toBe(3);
    expect(isInFlightTripDay(1, flights)).toBe(true);
    expect(isInFlightTripDay(2, flights)).toBe(true);
    expect(isInFlightTripDay(3, flights)).toBe(false);
    expect(arrivalDaySlot(flights)).toBe("morning");
  });
});
