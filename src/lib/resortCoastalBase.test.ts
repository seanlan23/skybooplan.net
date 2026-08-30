import { describe, expect, it } from "vitest";
import {
  resolveResortCoastalBase,
  resortCoastalPlaceLabel,
  resortCoastalPromptNote,
} from "@/lib/resortCoastalBase";

describe("resolveResortCoastalBase", () => {
  it("maps a country-only resort query to a coastal hub, not the capital", () => {
    expect(resolveResortCoastalBase("Tajska", "resort")?.iata).toBe("HKT");
    expect(resolveResortCoastalBase("Thailand", "resort")?.hotelQuery).toBe("Phuket");
    expect(resolveResortCoastalBase("Mehika", "resort")?.iata).toBe("CUN");
    expect(resolveResortCoastalBase("Indonezija", "resort")?.hotelQuery).toBe("Nusa Dua");
    expect(resolveResortCoastalBase("Filipini", "resort")?.iata).toBe("CEB");
  });

  it("does not remap when the guest already named a town or chose explore", () => {
    expect(resolveResortCoastalBase("Phuket", "resort")).toBeNull();
    expect(resolveResortCoastalBase("Bangkok", "resort")).toBeNull();
    expect(resolveResortCoastalBase("Cancun", "resort")).toBeNull();
    expect(resolveResortCoastalBase("Tajska", "explore")).toBeNull();
    expect(resolveResortCoastalBase("Tajska", "roadtrip")).toBeNull();
  });

  it("builds the overview sentence for the chosen beach base", () => {
    const base = resolveResortCoastalBase("Tajska", "resort")!;
    expect(resortCoastalPlaceLabel(base)).toBe("Phuket, Tajska");
    expect(resortCoastalPromptNote(base, "sl")).toMatch(/Phuket \/ Krabi/);
    expect(resortCoastalPromptNote(base, "sl")).toMatch(/peščenih plaž/);
  });
});
