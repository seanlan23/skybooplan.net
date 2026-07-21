import { describe, expect, it } from "vitest";
import { formatActivityClockRange } from "@/lib/activityTime";

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
