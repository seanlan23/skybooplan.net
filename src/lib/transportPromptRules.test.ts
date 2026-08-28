import { describe, expect, it } from "vitest";
import { DISTANCE_TRANSPORT_RULES } from "@/lib/transportPromptRules";

describe("DISTANCE_TRANSPORT_RULES", () => {
  it("forbids short-hop flights and mandates car for Croatia coast", () => {
    expect(DISTANCE_TRANSPORT_RULES).toContain("500 km");
    expect(DISTANCE_TRANSPORT_RULES).toContain("Under 300 km");
    expect(DISTANCE_TRANSPORT_RULES).toContain("Ljubljana");
    expect(DISTANCE_TRANSPORT_RULES).toContain("Zadar");
    expect(DISTANCE_TRANSPORT_RULES).toContain("NEVER a flight");
    expect(DISTANCE_TRANSPORT_RULES).toMatch(/Phuket \(HKT\) → Krabi \/ Ao Nang/);
    expect(DISTANCE_TRANSPORT_RULES).toMatch(/NEVER a flight \(HKT–KBV/);
    expect(DISTANCE_TRANSPORT_RULES).toMatch(/Koh Lanta has NO airport/);
    expect(DISTANCE_TRANSPORT_RULES).toMatch(/Krabi \(KBV\)/);
    expect(DISTANCE_TRANSPORT_RULES).toMatch(/ONLY when the overnight city changes/);
    expect(DISTANCE_TRANSPORT_RULES).toMatch(/never splice it into the middle of the mainland coast/i);
    expect(DISTANCE_TRANSPORT_RULES).toMatch(/Busuanga \/ USU|Busuanga \(USU\)/);
    expect(DISTANCE_TRANSPORT_RULES).toMatch(/Cebu → Malapascua/);
  });
});
