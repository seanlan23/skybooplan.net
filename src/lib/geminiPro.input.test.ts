import { describe, expect, it } from "vitest";
import { generateGeminiProTripInputSchema } from "@/lib/geminiPro.functions";

describe("generateGeminiProTripInputSchema", () => {
  it("accepts flight-only context without ground transport fields", () => {
    const result = generateGeminiProTripInputSchema.safeParse({
      originIata: "LJU",
      destinationIata: "FCO",
      departDate: "2026-08-14",
      returnDate: "2026-08-21",
      pax: { adults: 2 },
      budget: "standard",
    });
    expect(result.success).toBe(true);
  });

  it("rejects ground transport mode without place labels", () => {
    const result = generateGeminiProTripInputSchema.safeParse({
      originIata: "LJU",
      destinationIata: "FCO",
      departDate: "2026-08-14",
      groundTransportMode: "car",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ground transport when places are provided", () => {
    const result = generateGeminiProTripInputSchema.safeParse({
      departDate: "2026-08-14",
      returnDate: "2026-08-21",
      groundTransportMode: "car",
      originPlace: "Ljubljana, Slovenija",
      destinationPlace: "Rim, Italija",
    });
    expect(result.success).toBe(true);
  });
});
