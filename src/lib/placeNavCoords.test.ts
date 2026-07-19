import { describe, expect, it } from "vitest";
import { lookupPlaceNavTarget } from "@/lib/placeNavCoords";

describe("lookupPlaceNavTarget", () => {
  it("resolves Rassada from Phuket ferry label", () => {
    const t = lookupPlaceNavTarget("Phuket (Rassada Pier)", { ferry: true });
    expect(t?.query).toMatch(/Rassada/i);
    expect(t?.lat).toBeCloseTo(7.8955, 3);
  });

  it("defaults Phuket ferry destination to Rassada pier", () => {
    const t = lookupPlaceNavTarget("Phuket", { ferry: true });
    expect(t?.query).toMatch(/Rassada/i);
  });

  it("resolves Tonsai from Koh Phi Phi ferry origin", () => {
    const t = lookupPlaceNavTarget("Koh Phi Phi", { ferry: true });
    expect(t?.query).toMatch(/Tonsai/i);
  });
});
