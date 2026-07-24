import { describe, expect, it } from "vitest";
import {
  formatActivityClockLabel,
  formatActivityClockRange,
  normalizeActivityClocks,
} from "@/lib/activityTime";

describe("formatActivityClockRange", () => {
  it("joins start–end in arrival/departure order", () => {
    expect(formatActivityClockRange("17:55", "19:25")).toBe("17:55 – 19:25");
  });

  it("marks overnight when end is earlier on the clock", () => {
    expect(formatActivityClockRange("21:10", "17:55")).toBe("21:10 – 17:55 (+1)");
  });

  it("returns single side when one is missing", () => {
    expect(formatActivityClockRange("09:00", undefined)).toBe("09:00");
    expect(formatActivityClockRange(null, "11:30")).toBe("11:30");
  });
});

describe("formatActivityClockLabel", () => {
  it("shows one clock for Prihod with inverted range (Grok bug)", () => {
    expect(
      formatActivityClockLabel({
        name: "Prihod na letališče",
        arrivalTime: "19:30",
        departureTime: "18:00",
      }),
    ).toBe("19:30");
  });

  it("shows one clock for Check-in", () => {
    expect(
      formatActivityClockLabel({
        name: "Check-in, osvežitev in kratek odmor",
        type: "STAY",
        arrivalTime: "20:30",
        departureTime: "18:00",
      }),
    ).toBe("20:30");
  });

  it("keeps overnight flight range on international flight", () => {
    expect(
      formatActivityClockLabel({
        name: "Mednarodni let",
        transportType: "flight",
        arrivalTime: "17:55",
        departureTime: "08:30",
      }),
    ).toBe("17:55 – 08:30 (+1)");
  });
});

describe("normalizeActivityClocks", () => {
  it("collapses inverted check-in clocks to a single time", () => {
    const a = normalizeActivityClocks({
      name: "Check-in",
      type: "STAY",
      arrivalTime: "20:30",
      departureTime: "18:00",
    });
    expect(a.arrivalTime).toBe("20:30");
    expect(a.departureTime).toBeUndefined();
  });
});
