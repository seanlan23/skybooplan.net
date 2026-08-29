import { describe, expect, it } from "vitest";
import { formatPaxCountPhrase, formatPaxUiCount, slPaxAfterNumber, slPaxAfterZa } from "@/lib/slovenePax";

describe("slovene traveler dual", () => {
  it("uses potnika for 2, not potnikov", () => {
    expect(slPaxAfterNumber(2)).toBe("2 potnika");
    expect(slPaxAfterZa(2)).toBe("2 potnika");
    expect(formatPaxCountPhrase("Za {n} potnikov", 2)).toBe("Za 2 potnika");
    expect(formatPaxCountPhrase("skupaj za {n} potnikov", 2)).toBe("skupaj za 2 potnika");
    expect(formatPaxCountPhrase("Za {n} potnikov", 5)).toBe("Za 5 potnikov");
    expect(formatPaxUiCount(2, "sl", "potnik", "potnikov")).toBe("2 potnika");
    expect(formatPaxUiCount(2, "en", "traveler", "travelers")).toBe("2 travelers");
  });
});
