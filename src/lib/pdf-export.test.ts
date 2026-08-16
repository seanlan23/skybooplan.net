import { describe, expect, it } from "vitest";
import { isPdfDaypartToken, normalizePlanForPdf, sanitizePdfText } from "@/lib/pdf-export";

describe("sanitizePdfText", () => {
  it("strips emoji that break jsPDF custom fonts", () => {
    expect(sanitizePdfText("Odhod 🚐 iz Mežice")).toBe("Odhod iz Mežice");
  });

  it("never throws on empty or non-string input", () => {
    expect(sanitizePdfText(undefined)).toBe("");
    expect(sanitizePdfText(null)).toBe("");
    expect(sanitizePdfText(12)).toBe("");
    expect(sanitizePdfText("")).toBe("");
  });
});

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
                  arrivalTime: "08:00",
                  departureTime: "09:20",
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
    // arrivalTime – departureTime (same order as UI), not reversed.
    expect(day.slots[0]!.items[0]!.time).toBe("08:00 – 09:20");
    expect(model.totalBudgetEur).toBe(2400);
    expect(model.coverImageUrl).toBeUndefined();
  });

  it("passes cover_image_url through for hero cover", () => {
    const model = normalizePlanForPdf({
      title: "MUC → SYD",
      destination: "Sydney",
      start_date: "2026-09-04",
      end_date: "2026-09-18",
      language: "en",
      cover_image_url: "https://images.example.com/sydney.jpg",
      itinerary: { summary: "Harbour city.", days: [] },
    });
    expect(model.coverImageUrl).toBe("https://images.example.com/sydney.jpg");
    expect(model.destination).toBe("Sydney");
  });

  it("formats overnight activity clocks with +1 (not reversed)", () => {
    const model = normalizePlanForPdf({
      title: "MUC → HKT",
      destination: "Phuket",
      start_date: "2026-10-26",
      end_date: "2026-11-10",
      language: "sl",
      itinerary: {
        days: [
          {
            day: 1,
            title: "Mednarodni let",
            city: "Munich",
            activities: {
              morning: [
                {
                  name: "Mednarodni let",
                  arrivalTime: "21:10",
                  departureTime: "17:55",
                  description: "Nočni let.",
                },
              ],
              afternoon: [],
              evening: [],
            },
          },
        ],
      },
    });
    expect(model.days[0]!.slots[0]!.items[0]!.time).toBe("21:10 – 17:55 (+1)");
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

  it("does not show Morning/Afternoon timeSlot as activity clock badges", () => {
    expect(isPdfDaypartToken("Morning")).toBe(true);
    expect(isPdfDaypartToken("14:30")).toBe(false);

    const model = normalizePlanForPdf({
      title: "MUC → CDG",
      destination: "France",
      start_date: "2026-10-26",
      end_date: "2026-10-27",
      language: "en",
      itinerary: {
        days: [
          {
            day: 2,
            title: "Iconic Paris",
            city: "Paris",
            activities: {
              morning: [
                {
                  name: "Eiffel Tower Experience",
                  timeSlot: "Morning",
                  time: "Morning",
                  description: "Pre-book tickets.",
                  estimatedCostEur: 29,
                },
              ],
              afternoon: [],
              evening: [
                {
                  name: "Seine River Cruise",
                  timeSlot: "Evening",
                  description: "Sunset cruise.",
                },
              ],
            },
          },
        ],
      },
    });

    const morning = model.days[0]!.slots.find((s) => s.label === "Morning");
    const evening = model.days[0]!.slots.find((s) => s.label === "Evening");
    expect(morning?.items[0]?.time).toBeUndefined();
    expect(evening?.items[0]?.time).toBeUndefined();
  });

  it("aligns summary N-day copy with itinerary length", () => {
    const model = normalizePlanForPdf({
      title: "VIE → CDG",
      destination: "Francija",
      start_date: "2026-09-20",
      end_date: "2026-09-27",
      language: "sl",
      itinerary: {
        summary: "Pripravite se na nepozabno 8-dnevno potovanje po Franciji.",
        days: Array.from({ length: 7 }, (_, i) => ({
          day: i + 1,
          date: `2026-09-${20 + i}`,
          title: `Dan ${i + 1}`,
          city: i < 3 ? "Paris" : "Lyon",
        })),
      },
    });
    expect(model.summary).toMatch(/7-dnevno/);
    expect(model.summary).not.toMatch(/8-dnevno/);
    expect(model.days).toHaveLength(7);
  });
});
