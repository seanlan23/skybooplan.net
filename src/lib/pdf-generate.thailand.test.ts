import { describe, expect, it } from "vitest";
import { generatePlanPdf } from "@/lib/pdf-export";

describe("generatePlanPdf Thailand 16d", () => {
  it("builds a PDF for a 16-day Phuket / Andaman plan", async () => {
    const cities = [
      "Phuket",
      "Phuket",
      "Khao Sok",
      "Khao Sok",
      "Ao Nang",
      "Ao Nang",
      "Ao Nang",
      "Koh Phi Phi",
      "Koh Phi Phi",
      "Koh Phi Phi",
      "Patong",
      "Patong",
      "Patong",
      "Phuket",
      "Phuket",
      "Phuket",
    ];
    const days = cities.map((city, i) => ({
      day: i + 1,
      date: `2026-10-${String(26 + (i % 5)).padStart(2, "0")}`,
      title: `Day ${i + 1}: ${city} — beach & culture with “quotes” and € → test`,
      city,
      lat: 7.88 + i * 0.01,
      lng: 98.39,
      dailyBudgetEur: 45,
      activities: {
        morning: [
          {
            name: `Morning in ${city}`,
            description: "Walk & coffee. Local market.",
            estimatedCostEur: 10,
            lat: 7.88,
            lng: 98.39,
          },
        ],
        afternoon: [
          {
            name: `Sightseeing ${city}`,
            description: "Temple / beach",
            estimatedCostEur: 20,
          },
        ],
        evening: [
          {
            name: "Dinner",
            description: "Seafood €15–25",
            estimatedCostEur: 15,
          },
        ],
      },
    }));

    const result = await generatePlanPdf({
      title: "Munich → Phuket → Munich",
      destination: "Thailand",
      start_date: "2026-10-26",
      end_date: "2026-11-10",
      language: "en",
      pax: 3,
      itinerary: {
        summary: "This 16-day journey through Thailand Andaman coast.",
        destinationName: "Thailand",
        destinationIata: "HKT",
        totalBudgetEur: 2154,
        days,
      },
    });

    expect(result.fileName).toMatch(/\.pdf$/i);
    expect(result.buffer.byteLength).toBeGreaterThan(2000);
  });

  it("still builds a PDF when title is empty and a clock label is huge", async () => {
    const result = await generatePlanPdf({
      title: "",
      destination: "",
      start_date: null,
      end_date: null,
      itinerary: {
        days: [
          {
            day: 1,
            title: "Arrival",
            city: "Paris",
            transportation: [{ from: "CDG", to: "hotel" }],
            activities: {
              morning: [
                {
                  name: "Transfer",
                  arrivalTime: "x".repeat(400),
                  description: "Taxi",
                },
              ],
            },
          },
        ],
      },
    });
    expect(result.buffer.byteLength).toBeGreaterThan(500);
  });
});
