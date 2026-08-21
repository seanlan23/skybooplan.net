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

  it("does not default car trips to FCO", async () => {
    const { generateTripInputSchema } = await import("@/lib/geminiPro.functions");
    const result = generateTripInputSchema.safeParse({
      departDate: "2026-08-14",
      returnDate: "2026-08-24",
      groundTransportMode: "car",
      originPlace: "Črna na Koroškem",
      destinationPlace: "Balkan, TM",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.destinationIata).toBe("");
    expect(result.data.originIata).toBe("");
    expect(result.data.destinationPlace).toBe("Balkan");
  });

  it("accepts a partial resume plan so a second 280s call can finish 6/13", () => {
    const result = generateGeminiProTripInputSchema.safeParse({
      originIata: "FRA",
      destinationIata: "CUN",
      departDate: "2026-10-26",
      returnDate: "2026-11-07",
      pax: { adults: 2 },
      budget: "standard",
      resumePlan: {
        destinationName: "Mehika",
        summary: "Yucatán",
        centerLat: 21.16,
        centerLng: -86.85,
        days: [{ day: 1, title: "Prihod", city: "Cancun" }],
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.resumePlan?.days).toHaveLength(1);
  });
});
