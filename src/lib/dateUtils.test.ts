import { describe, expect, it } from "vitest";
import { inclusiveCalendarDayCount } from "@/lib/dateUtils";

describe("inclusiveCalendarDayCount", () => {
  it("counts start and end as two days of a one-night span", () => {
    expect(inclusiveCalendarDayCount("2026-07-24", "2026-07-25")).toBe(2);
  });

  it("counts 24 Jul through 2 Aug as 10 inclusive days, not 9 nights", () => {
    expect(inclusiveCalendarDayCount("2026-07-24", "2026-08-02")).toBe(10);
  });

  it("counts 17 Oct through 31 Oct as 15 inclusive days, not 13", () => {
    expect(inclusiveCalendarDayCount("2026-10-17", "2026-10-31")).toBe(15);
  });

  it("counts a same-day trip as 1", () => {
    expect(inclusiveCalendarDayCount("2026-08-18", "2026-08-18")).toBe(1);
  });

  it("does not change if dates are reversed", () => {
    expect(inclusiveCalendarDayCount("2026-09-26", "2026-09-19")).toBe(8);
  });

  it("stays stable across EU DST spring-forward", () => {
    expect(inclusiveCalendarDayCount("2026-03-28", "2026-03-30")).toBe(3);
  });

  it("stays stable across EU DST fall-back", () => {
    expect(inclusiveCalendarDayCount("2026-10-24", "2026-10-26")).toBe(3);
  });
});
