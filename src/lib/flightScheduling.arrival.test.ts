import { describe, expect, it } from "vitest";
import {
  ARRIVAL_HOTEL_OFFSET_MIN,
  ARRIVAL_TRANSFER_OFFSET_MIN,
  arrivalDaySlot,
  arrivalTripDay,
  applyLongHaulArrivalOffset,
  buildArrivalLogistics,
  isInFlightTripDay,
  isLateArrival,
  isRedEyeArrival,
  isTightArrivalDay,
} from "@/lib/flightScheduling";
import { resolveTripLocale } from "@/lib/tripLocale";

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

describe("Etihad-style 17:55 +1d arrival", () => {
  const flights = {
    outboundDepart: "21:10",
    outboundArrive: "17:55",
    outboundArriveDayOffset: 1,
  };

  it("is evening slot / late — not a free afternoon before landing", () => {
    expect(arrivalTripDay(flights)).toBe(2);
    expect(arrivalDaySlot(flights)).toBe("evening");
    expect(isLateArrival(flights)).toBe(true);
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

describe("arrival logistics clock stagger (MUC–SYD)", () => {
  const flights = {
    outboundDepart: "22:00",
    outboundArrive: "16:50",
    outboundArriveDayOffset: 1,
  };

  it("airport → transfer (+45) → hotel (+90), never all on land time", () => {
    const locale = resolveTripLocale("SYD", "Sydney", "en");
    const rows = buildArrivalLogistics("Sydney", flights, locale);
    expect(ARRIVAL_TRANSFER_OFFSET_MIN).toBe(45);
    expect(ARRIVAL_HOTEL_OFFSET_MIN).toBe(90);
    expect(rows[0]!.arrivalTime).toBe("16:50");
    expect(rows[1]!.arrivalTime).toBe("17:35");
    expect(rows[1]!.departureTime).toBeUndefined();
    expect(rows[2]!.arrivalTime).toBe("18:20");
    expect(new Set(rows.map((r) => r.arrivalTime)).size).toBe(3);
  });
});

describe("applyLongHaulArrivalOffset", () => {
  it("treats LJU 06:40 → BKK 08:55 as next-day landing", () => {
    const flights = {
      outboundDepart: "06:40",
      outboundArrive: "08:55",
      outboundArriveDayOffset: 0,
    };
    applyLongHaulArrivalOffset(flights, "LJU", "BKK");
    expect(flights.outboundArriveDayOffset).toBe(1);
    expect(arrivalTripDay(flights)).toBe(2);
    expect(isInFlightTripDay(1, flights)).toBe(true);
  });

  it("does not bump a same-day westbound MUC → JFK clock", () => {
    const flights = {
      outboundDepart: "11:00",
      outboundArrive: "14:00",
      outboundArriveDayOffset: 0,
    };
    applyLongHaulArrivalOffset(flights, "MUC", "JFK");
    expect(flights.outboundArriveDayOffset).toBe(0);
  });
});
