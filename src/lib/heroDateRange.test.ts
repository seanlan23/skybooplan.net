import { describe, expect, it } from "vitest";
import {
  formatHeroDateRangeLabel,
  parseHeroDateRange,
  parseHeroDateRangeStart,
} from "@/lib/heroDateRange";

describe("formatHeroDateRangeLabel", () => {
  it("formats a Slovenian date range", () => {
    const label = formatHeroDateRangeLabel(
      {
        from: new Date(2026, 5, 16, 12),
        to: new Date(2026, 5, 23, 12),
      },
      "sl",
    );
    expect(label).toContain("→");
    expect(label).toContain("2026");
    expect(label.toLowerCase()).toMatch(/16.*jun.*23.*jun/);
  });
});

describe("parseHeroDateRangeStart", () => {
  it("parses range label back to ISO depart date", () => {
    const iso = parseHeroDateRangeStart("16. jun → 23. jun 2026", "sl");
    expect(iso).toBe("2026-06-16");
  });
});

describe("parseHeroDateRange", () => {
  it("keeps return day across months (not +7 nights)", () => {
    expect(parseHeroDateRange("26. okt → 10. nov 2026", "sl")).toEqual({
      departDate: "2026-10-26",
      returnDate: "2026-11-10",
    });
  });
});
