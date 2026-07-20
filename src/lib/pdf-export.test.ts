import { describe, expect, it } from "vitest";
import { normalizePlanForPdf } from "@/lib/pdf-export";

describe("normalizePlanForPdf", () => {
  it("maps AiTripPlan activities into morning/afternoon/evening slots", () => {
    const model = normalizePlanForPdf({
      title: "VIE → MNL",
      destination: "Manila, Filipini",
      start_date: "2026-10-27",
      end_date: "2026-11-12",
      language: "sl",
      itinerary: {
        summary:
          "Pripravite se na avanturo po filipinskem otočju. Ekskluzivni popusti za eSIM kartice in zavarovanje te čakajo.",
        totalBudgetEur: 2400,
        days: [
          {
            day: 4,
            date: "2026-10-30",
            title: "Potovanje v El Nido",
            city: "El Nido",
            dailyBudgetEur: 120,
            transportation: [
              {
                type: "flight",
                from: "MNL",
                to: "ENI",
                duration: "1h 20min",
                estimatedPrice: 60,
              },
            ],
            activities: {
              morning: [
                {
                  name: "Notranji let MNL → El Nido",
                  departureTime: "08:00",
                  arrivalTime: "09:20",
                  description: "Let iz Manile na Palawan.",
                  estimatedCostEur: 60,
                },
              ],
              afternoon: [
                {
                  name: "Check-in in sprehod po mestu",
                  description: "Namestitev in Nacpan priprave.",
                },
              ],
              evening: [],
            },
          },
        ],
      },
    });

    expect(model.summary).toMatch(/filipinskem otočju/i);
    expect(model.summary).not.toMatch(/eSIM|zavarovan/i);
    expect(model.labels.daily).toBe("Dnevni itinerar");
    expect(model.days).toHaveLength(1);

    const day = model.days[0]!;
    expect(day.city).toBe("El Nido");
    expect(day.transportation[0]?.from).toBe("MNL");
    expect(day.slots.map((s) => s.label)).toEqual(["Dopoldan", "Popoldan"]);
    expect(day.slots[0]!.items[0]!.title).toMatch(/MNL/i);
    expect(day.slots[0]!.items[0]!.time).toContain("08:00");
    expect(model.totalBudgetEur).toBe(2400);
  });

  it("falls back to legacy items[] when activities are missing", () => {
    const model = normalizePlanForPdf({
      title: "Trip",
      destination: "Rome",
      start_date: null,
      end_date: null,
      language: "en",
      itinerary: {
        days: [
          {
            day: 1,
            title: "Arrival",
            items: [{ time: "10:00", title: "Colosseum", description: "Skip the line" }],
          },
        ],
      },
    });

    expect(model.labels.morning).toBe("Morning");
    expect(model.days[0]!.slots[0]!.items[0]!.title).toBe("Colosseum");
  });

  it("keeps Slovenian characters in titles for PDF model", () => {
    const model = normalizePlanForPdf({
      title: "Čokoladni hribi",
      destination: "Bohol",
      start_date: "2026-11-04",
      end_date: "2026-11-04",
      itinerary: {
        summary: "Ogled čokoladnih hribov in tarsierjev.",
        days: [{ day: 9, date: "2026-11-04", title: "Čokoladni hribi in tarsierji", city: "Bohol" }],
      },
    });
    expect(model.days[0]!.title).toBe("Čokoladni hribi in tarsierji");
    expect(model.summary).toContain("čokoladnih");
  });
});
