import { describe, expect, it } from "vitest";
import {
  clearActivityStructuredClocks,
  formatActivityClockLabel,
  formatActivityClockRange,
  normalizeActivityClocks,
  parseHmClock,
  sortDayActivitiesByClock,
  stripProseClocksExcept,
  uniquifyDayActivityClocks,
} from "@/lib/activityTime";

describe("parseHmClock", () => {
  it("parses Gemini nested-slot HH:MM and rejects day-part labels", () => {
    expect(parseHmClock("15:00")).toBe("15:00");
    expect(parseHmClock("9:05")).toBe("09:05");
    expect(parseHmClock("evening")).toBeUndefined();
    expect(parseHmClock("Večer")).toBeUndefined();
  });
});

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

describe("stripProseClocksExcept", () => {
  it("removes invented HH:MM but keeps boarding-pass times", () => {
    const out = stripProseClocksExcept(
      "Meet at 09:15. Flight departs at 08:30, arrive 10:00.",
      ["08:30", "10:00"],
    );
    expect(out).toMatch(/08:30/);
    expect(out).toMatch(/10:00/);
    expect(out).not.toMatch(/09:15/);
  });

  it("clearActivityStructuredClocks drops fields", () => {
    const a = clearActivityStructuredClocks({
      name: "Temple",
      arrivalTime: "10:00",
      departureTime: "12:00",
    });
    expect(a.arrivalTime).toBeUndefined();
    expect(a.departureTime).toBeUndefined();
  });
});

describe("sortDayActivitiesByClock", () => {
  it("re-buckets by start clock from 00:00 to 23:59", () => {
    const out = sortDayActivitiesByClock({
      morning: [{ name: "Evening flight", arrivalTime: "21:10" }],
      afternoon: [{ name: "Checkout", arrivalTime: "17:00" }],
      evening: [{ name: "Museum", arrivalTime: "10:00" }],
    });
    expect(out.morning.map((a) => a.name)).toEqual(["Museum"]);
    expect(out.afternoon.map((a) => a.name)).toEqual([]);
    expect(out.evening.map((a) => a.name)).toEqual(["Checkout", "Evening flight"]);
  });

  it("keeps untimed items in their original slot after timed ones at that daypart", () => {
    const out = sortDayActivitiesByClock({
      morning: [{ name: "Walk" }],
      afternoon: [{ name: "Lunch", arrivalTime: "13:00" }],
      evening: [],
    });
    expect(out.morning.map((a) => a.name)).toEqual(["Walk"]);
    expect(out.afternoon.map((a) => a.name)).toEqual(["Lunch"]);
  });
});

describe("uniquifyDayActivityClocks", () => {
  it("bumps a duplicate start clock on the same day", () => {
    const out = uniquifyDayActivityClocks({
      morning: [
        { name: "Arrival", arrivalTime: "10:00" },
        { name: "Museum", arrivalTime: "10:00" },
      ],
      afternoon: [],
      evening: [],
    });
    expect(out.morning.map((a) => a.arrivalTime)).toEqual(["10:00", "10:30"]);
  });
});
