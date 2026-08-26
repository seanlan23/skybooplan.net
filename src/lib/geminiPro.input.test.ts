import { describe, expect, it } from "vitest";
import {
  buildGeminiTripPlanParams,
  generateGeminiProTripInputSchema,
  generateTripInputSchema,
} from "@/lib/geminiPro.functions";

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

  it("keeps currency, language, interests, and wishes from the frontend payload", () => {
    const result = generateGeminiProTripInputSchema.safeParse({
      originIata: "MUC",
      destinationIata: "BKK",
      departDate: "2026-10-26",
      returnDate: "2026-11-10",
      pax: { adults: 2 },
      language: "sl",
      currency: "USD",
      pace: "calm",
      priorities: ["sanjske plaže, kulinarika"],
      customWishes: "prvo noč Phuket",
      wishTags: ["Brez nočnih voženj"],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.language).toBe("sl");
    expect(result.data.currency).toBe("USD");
    expect(result.data.priorities).toEqual(["sanjske plaže, kulinarika"]);
    expect(result.data.customWishes).toBe("prvo noč Phuket");
    expect(result.data.wishTags).toContain("Brez nočnih voženj");
  });
});

describe("buildGeminiTripPlanParams", () => {
  it("forwards language, currency, interests, wishes, and ground transport to Gemini", () => {
    const parsed = generateTripInputSchema.safeParse({
      departDate: "2026-08-14",
      returnDate: "2026-08-21",
      groundTransportMode: "car",
      originPlace: "Ljubljana, Slovenija",
      destinationPlace: "Rim, Italija",
      language: "de",
      currency: "EUR",
      priorities: ["Sehenswürdigkeiten, Kulinarik"],
      customWishes: "zwei Nächte in Florenz",
      wishTags: ["Najem avtomobila"],
      pace: "relaxed",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const params = buildGeminiTripPlanParams(parsed.data, 8);
    expect(params.language).toBe("de");
    expect(params.currency).toBe("EUR");
    expect(params.priorities).toEqual(["Sehenswürdigkeiten, Kulinarik"]);
    expect(params.customWishes).toBe("zwei Nächte in Florenz");
    expect(params.groundTransportMode).toBe("car");
    expect(params.originPlace).toBe("Ljubljana, Slovenija");
    expect(params.destinationPlace).toBe("Rim, Italija");
  });
});
