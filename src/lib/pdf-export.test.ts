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

  it("adds Booking.com stay links when Gemini left hotels[] empty", () => {
    const model = normalizePlanForPdf({
      title: "Albanija in Balkan",
      destination: "Albanija",
      start_date: "2026-08-24",
      end_date: "2026-09-03",
      language: "sl",
      pax: 2,
      itinerary: {
        originPlace: "Vienna",
        groundTransportMode: "car",
        hotels: [],
        days: [
          { day: 1, date: "2026-08-24", city: "Zagreb", title: "Dunaj → Zagreb" },
          { day: 2, date: "2026-08-25", city: "Zagreb", title: "Zagreb" },
          { day: 3, date: "2026-08-26", city: "Split", title: "Split" },
          { day: 4, date: "2026-08-27", city: "Split", title: "Split" },
          { day: 11, date: "2026-09-03", city: "Vienna", title: "Vožnja domov" },
        ],
      },
    });

    expect(model.hotels.map((h) => h.text)).toEqual([
      expect.stringMatching(/Zagreb.*2 noči/),
      expect.stringMatching(/Split.*2 noči/),
    ]);
    expect(model.hotels.every((h) => h.url?.includes("/api/go/booking"))).toBe(true);
    expect(model.days[0]?.bookingUrl).toMatch(/skybooplan\.com\/api\/go\/booking/);
    expect(model.days[2]?.bookingUrl).toMatch(/ss=Split|Split/);
    expect(model.days[4]?.bookingUrl).toBeUndefined();
  });

  it("counts Philippines island hotel nights, not 1 night per hop", () => {
    const model = normalizePlanForPdf({
      title: "Filipini",
      destination: "Filipini / Manila",
      start_date: "2026-10-03",
      end_date: "2026-10-16",
      language: "sl",
      pax: 2,
      itinerary: {
        originPlace: "München",
        hotels: [],
        days: [
          { day: 1, date: "2026-10-03", city: "Munich", title: "Odhod iz MUC", inFlightDay: true },
          { day: 2, date: "2026-10-04", city: "Manila", title: "Prihod" },
          { day: 3, date: "2026-10-05", city: "Manila", title: "Intramuros", inFlightDay: true },
          { day: 4, date: "2026-10-06", city: "El Nido", title: "Let v El Nido", inFlightDay: true },
          { day: 5, date: "2026-10-07", city: "El Nido", title: "Tour A" },
          { day: 6, date: "2026-10-08", city: "El Nido", title: "Tour C", inFlightDay: true },
          { day: 14, date: "2026-10-16", city: "Manila", title: "Odhod", inFlightDay: true },
        ],
      },
    });
    expect(model.hotels.map((h) => h.text)).toEqual([
      expect.stringMatching(/Manila.*2 noči/),
      expect.stringMatching(/El Nido.*3 noči/),
    ]);
  });

  it("does not invent Booking hotel links for motorhome plans", () => {
    const model = normalizePlanForPdf({
      title: "Italija",
      destination: "Italija",
      start_date: "2026-08-01",
      end_date: "2026-08-05",
      language: "sl",
      itinerary: {
        accommodationMode: "motorhome",
        groundTransportMode: "motorhome",
        days: [
          { day: 1, date: "2026-08-01", city: "Venice", title: "Kamp" },
          { day: 2, date: "2026-08-02", city: "Venice", title: "Ogled" },
        ],
      },
    });
    expect(model.hotels).toEqual([]);
    expect(model.days.every((d) => !d.bookingUrl)).toBe(true);
  });

  it("puts curated travel insurance on the PDF after the overview", () => {
    const model = normalizePlanForPdf({
      title: "LJU → BKK",
      destination: "Bangkok",
      start_date: "2026-10-01",
      end_date: "2026-10-14",
      language: "sl",
      ipCountry: "SI",
      itinerary: {
        originIata: "LJU",
        destinationIata: "BKK",
        summary: "Dva tedna v Bangkoku in na otokih.",
        days: [{ day: 1, date: "2026-10-01", city: "Bangkok", title: "Prihod" }],
      },
    });
    expect(model.labels.insurance).toBe("Turistično zavarovanje");
    expect(model.insurance?.body).toMatch(/EKZZ/);
    expect(model.insurance?.insurers).toMatch(/Coris/);
    expect(model.insurance?.insurers).toMatch(/Triglav/);
  });

  it("picks PDF insurers from IP country, not the departure airport", () => {
    const fromMunich = normalizePlanForPdf({
      title: "MUC → BKK",
      destination: "Bangkok",
      start_date: "2026-10-01",
      end_date: "2026-10-14",
      language: "de",
      ipCountry: "SI",
      itinerary: {
        originIata: "MUC",
        destinationIata: "BKK",
        days: [{ day: 1, date: "2026-10-01", city: "Bangkok", title: "Prihod" }],
      },
    });
    expect(fromMunich.insurance?.insurers).toMatch(/Coris/);
    expect(fromMunich.insurance?.insurers).not.toMatch(/ADAC/);

    const germanIp = normalizePlanForPdf({
      title: "LJU → BKK",
      destination: "Bangkok",
      start_date: "2026-10-01",
      end_date: "2026-10-14",
      language: "en",
      ipCountry: "DE",
      itinerary: {
        originIata: "LJU",
        destinationIata: "BKK",
        days: [{ day: 1, date: "2026-10-01", city: "Bangkok", title: "Arrival" }],
      },
    });
    expect(germanIp.insurance?.insurers).toMatch(/ADAC/);
  });
});
