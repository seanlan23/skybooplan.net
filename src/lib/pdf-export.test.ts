import { describe, expect, it } from "vitest";
import { isPdfDaypartToken, normalizePlanForPdf, sanitizePdfText, buildPdfDownloadFileName, pdfDayHeading, isPdfBaseTransferLeg, resolvePdfReturnFromIata } from "@/lib/pdf-export";
import { isoAddDays } from "@/lib/overnightHotelStays";

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

  it("strips planner meta-instructions from activity copy", () => {
    expect(
      sanitizePdfText(
        "Phuket: lokalne plaže. Ne enodnevni izlet na Koh Phi Phi — tam že imaš večdnevno bivanje.",
      ),
    ).toBe("Phuket: lokalne plaže.");
    expect(
      sanitizePdfText("Local sights. Not a day trip to Koh Phi Phi — you already stay there overnight."),
    ).toBe("Local sights.");
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

  it("maps day.localTips onto the yellow local-tips PDF callout", () => {
    const model = normalizePlanForPdf({
      title: "MUC → NRT",
      destination: "Tokyo",
      start_date: "2026-10-26",
      end_date: "2026-11-09",
      language: "sl",
      itinerary: {
        days: [
          {
            day: 5,
            date: "2026-10-30",
            title: "Akihabara",
            city: "Tokyo",
            transportationTips: "Tokyo Metro in JR.",
            localTips:
              "Voda iz pipe v Tokiu je pitna. Na Yamanote pazite na žeparje. V templju pokrij ramena; napitnine niso pričakovane.",
            activities: {
              evening: [
                {
                  name: "Večerja v Akihabari",
                  description: "Večerja in obisk igralnice v Akihabari.",
                  estimatedCostEur: 30,
                },
              ],
            },
          },
        ],
      },
    });
    expect(model.days[0]!.localTips).toMatch(/voda iz pipe|žeparje/i);
    expect(model.days[0]!.transportTips).toMatch(/Tokyo Metro/i);
    expect(model.labels.localTips).toBe("Nasveti lokalcev & varnost");
  });

  it("strips temple-dress copy from NYC local_tips and dedupes identical days", () => {
    const canned =
      "Voda iz pipe ni pitna. Ulična hrana na prometnih stojnicah. V templju pokrij ramena; napitnine niso pričakovane. The Met zahteva časovni vstop.";
    const model = normalizePlanForPdf({
      title: "MUC → NYC",
      destination: "New York",
      start_date: "2026-08-18",
      end_date: "2026-08-25",
      language: "sl",
      itinerary: {
        days: [
          {
            day: 2,
            date: "2026-08-19",
            title: "The Met in Broadway",
            city: "New York",
            localTips: canned,
            activities: {
              morning: [{ name: "The Met", description: "Časovni vstop." }],
              afternoon: [{ name: "Central Park", description: "Sprehod." }],
              evening: [{ name: "Broadway", description: "Predstava." }],
            },
          },
          {
            day: 3,
            date: "2026-08-20",
            title: "Harlem",
            city: "New York",
            localTips: canned,
            activities: {
              morning: [{ name: "Gospel maša v Harlemu", description: "Pridi zgodaj." }],
              afternoon: [{ name: "Apollo Theater", description: "Ogled." }],
              evening: [{ name: "Večerja v Harlemu", description: "Napitnina 20%." }],
            },
          },
        ],
      },
    });
    expect(model.days[0]!.localTips).toBeTruthy();
    expect(model.days[0]!.localTips).not.toMatch(/templj/i);
    expect(model.days[1]!.localTips).toBeFalsy();
  });

  it("orients day-1 international flight origin → destination and hides airport–hotel FLIGHT", () => {
    const model = normalizePlanForPdf({
      title: "VIE → CUN",
      destination: "Cancún",
      start_date: "2026-08-18",
      end_date: "2026-08-28",
      language: "sl",
      itinerary: {
        originIata: "VIE",
        destinationIata: "CUN",
        days: [
          {
            day: 1,
            date: "2026-08-18",
            title: "Prihod v Cancún",
            city: "Cancún",
            transportation: [
              {
                type: "flight",
                from: "Cancún (CUN)",
                to: "Dunaj (VIE)",
                duration: "12h",
                estimatedPrice: 620,
              },
              {
                type: "flight",
                from: "Cancún (CUN)",
                to: "Hotel zona Cancún",
                duration: "45min",
                estimatedPrice: 35,
              },
            ],
            activities: {
              morning: [],
              afternoon: [],
              evening: [],
            },
          },
        ],
      },
    });

    const day1 = model.days[0]!;
    expect(day1.transportation).toHaveLength(1);
    expect(day1.transportation[0]!.type.toLowerCase()).toBe("flight");
    expect(day1.transportation[0]!.from).toMatch(/Dunaj \(VIE\)/i);
    expect(day1.transportation[0]!.to).toMatch(/Cancún \(CUN\)/i);
  });

  it("orients day-1 Suvarnabhumi → München and drops the airport–hotel van", () => {
    const model = normalizePlanForPdf({
      title: "MUC → BKK",
      destination: "Bangkok",
      start_date: "2026-10-26",
      end_date: "2026-11-10",
      language: "sl",
      itinerary: {
        originIata: "MUC",
        destinationIata: "BKK",
        days: [
          {
            day: 1,
            date: "2026-10-26",
            title: "Prihod v Bangkok",
            city: "Bangkok",
            transportation: [
              {
                type: "van",
                from: "Suvarnabhumi",
                to: "München",
                duration: "11h",
                estimatedPrice: 0,
              },
              {
                type: "van",
                from: "Suvarnabhumi",
                to: "Bangkok",
                duration: "45min",
                estimatedPrice: 25,
              },
            ],
            activities: { morning: [], afternoon: [], evening: [] },
          },
        ],
      },
    });
    const day1 = model.days[0]!;
    expect(day1.transportation).toHaveLength(1);
    expect(day1.transportation[0]!.type.toLowerCase()).toBe("flight");
    expect(day1.transportation[0]!.from).toMatch(/München|Munich/i);
    expect(day1.transportation[0]!.to).toMatch(/Suvarnabhumi/i);
  });

  it("adds international tickets into the grand total and labels the split", () => {
    const model = normalizePlanForPdf({
      title: "BER → BKK",
      destination: "Bangkok",
      start_date: "2026-07-24",
      end_date: "2026-08-07",
      language: "sl",
      pax: 2,
      itinerary: {
        summary: "Petnajst dni po Tajski.",
        totalBudgetEur: 3874,
        planEur: 1000,
        flightEur: 2874,
        staysApproxEur: 770,
        flights: [
          { from: "BER", to: "BKK", date: "2026-07-24", airline: "17:55" },
          { from: "BKK", to: "BER", date: "2026-08-07", airline: "14:00" },
        ],
        days: [],
      },
    });
    expect(model.totalBudgetEur).toBe(3874);
    expect(model.planEur).toBe(1000);
    expect(model.flightEur).toBe(2874);
    expect(model.flights.some((f) => /2874/.test(f))).toBe(true);
    expect(model.flights.some((f) => /BER/.test(f) && /BKK/.test(f))).toBe(true);
  });

  it("saved plan dest-only total + flightTotalEur does not double-count", () => {
    const model = normalizePlanForPdf({
      title: "BER → BKK",
      destination: "Bangkok",
      start_date: "2026-07-24",
      end_date: "2026-08-07",
      language: "en",
      pax: 2,
      itinerary: {
        totalBudgetEur: 1000,
        flightTotalEur: 2874,
        days: [],
      },
    });
    expect(model.planEur).toBe(1000);
    expect(model.flightEur).toBe(2874);
    expect(model.totalBudgetEur).toBe(3874);
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

  it("sorts mixed-slot activities strictly by clock within the day", () => {
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
            title: "Odhod",
            city: "Munich",
            activities: {
              morning: [
                {
                  name: "Mednarodni let",
                  arrivalTime: "21:10",
                  departureTime: "17:55",
                  description: "Nočni let iz Münchna.",
                },
              ],
              afternoon: [],
              evening: [],
            },
          },
          {
            day: 16,
            title: "Povratek",
            city: "Phuket",
            activities: {
              morning: [
                {
                  name: "Mednarodni povratni let",
                  arrivalTime: "20:50",
                  description: "Polet proti Münchnu zvečer.",
                },
              ],
              afternoon: [
                {
                  name: "Odhod iz hotela (odjava)",
                  arrivalTime: "17:00",
                  description: "Popoldanska odjava pred letom.",
                },
              ],
              evening: [],
            },
          },
        ],
      },
    });
    const day1Items = model.days[0]!.slots.flatMap((s) => s.items);
    expect(day1Items[0]!.time).toMatch(/^21:10/);
    expect(model.days[0]!.slots[0]!.label.toLowerCase()).toMatch(/večer|evening/i);
    const lastItems = model.days[1]!.slots.flatMap((s) => s.items);
    expect(lastItems[0]!.title).toMatch(/odjava/i);
    expect(lastItems[0]!.time).toBe("17:00");
    expect(lastItems[lastItems.length - 1]!.time).toMatch(/^20:50/);
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
            items: [{ time: "10:00", title: "The Colosseum", description: "Skip the line" }],
          },
        ],
      },
    });

    expect(model.labels.morning).toBe("Morning");
    expect(model.days[0]!.slots[0]!.items[0]!.title).toBe("The Colosseum");
  });

  it("drops stub titles and ellipsis descriptions from the PDF model", () => {
    const model = normalizePlanForPdf({
      title: "Trip",
      destination: "Zanzibar",
      start_date: "2026-11-01",
      end_date: "2026-11-02",
      language: "sl",
      itinerary: {
        days: [
          {
            day: 3,
            title: "Dan 3",
            city: "Nungwi",
            activities: {
              morning: [{ name: "Dan 3", description: "…" }],
              afternoon: [
                {
                  name: "Sprehod po obali Nungwija",
                  description: "Po zajtrku se sprehodite ob severni plaži.",
                },
              ],
            },
          },
        ],
      },
    });
    const titles = model.days[0]!.slots.flatMap((s) => s.items.map((i) => i.title));
    expect(titles).toEqual(["Sprehod po obali Nungwija"]);
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
    expect(isPdfDaypartToken("Večer")).toBe(true);
    expect(isPdfDaypartToken("Večer: Večer")).toBe(true);
    expect(isPdfDaypartToken("Evening: Evening")).toBe(true);

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
    expect(model.hotels.map((h) => h.text).join(" ")).toMatch(/Venice.*1 noč/);
    expect(model.hotels.every((h) => !h.url)).toBe(true);
    expect(model.days.every((d) => !d.bookingUrl)).toBe(true);
  });

  it("prints NAMESTITVE camp stops for motorhome road trips", () => {
    const model = normalizePlanForPdf({
      title: "Hrvaška z avtodomom",
      destination: "Hrvaška",
      start_date: "2026-08-01",
      end_date: "2026-08-08",
      language: "sl",
      itinerary: {
        accommodationMode: "motorhome",
        groundTransportMode: "motorhome",
        hotels: [],
        days: [
          { day: 1, date: "2026-08-01", city: "Istra", title: "Istra" },
          { day: 2, date: "2026-08-02", city: "Istra", title: "Istra" },
          { day: 3, date: "2026-08-03", city: "Brač", title: "Brač" },
          { day: 4, date: "2026-08-04", city: "Brač", title: "Brač" },
          { day: 5, date: "2026-08-05", city: "Omiš", title: "Omiš" },
          { day: 6, date: "2026-08-06", city: "Omiš", title: "Omiš" },
          { day: 7, date: "2026-08-07", city: "Zagreb", title: "Zagreb" },
          { day: 8, date: "2026-08-08", city: "Zagreb", title: "Povratek" },
        ],
      },
    });
    expect(model.labels.stays).toMatch(/Namestitve/i);
    expect(model.hotels.map((h) => h.text)).toEqual([
      expect.stringMatching(/Istra.*2 noči/),
      expect.stringMatching(/Brač.*2 noči/),
      expect.stringMatching(/Omiš.*2 noči/),
      expect.stringMatching(/Zagreb.*1 noč/),
    ]);
    expect(model.hotels.every((h) => !h.url)).toBe(true);
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

  it("keeps complete activity titles instead of clipping them mid-word", () => {
    const model = normalizePlanForPdf({
      title: "MUC → JFK",
      destination: "Združene države Amerike",
      start_date: "2026-07-24",
      end_date: "2026-08-11",
      language: "sl",
      itinerary: {
        summary: "Potovanje po ZDA.",
        days: [
          {
            day: 2,
            city: "New York",
            title: "Manhattan",
            activities: {
              morning: [
                {
                  name: "Wat Phra Kaew",
                  description: "Ogled templja z zlatimi strehami in pogledom na reko.",
                },
              ],
              afternoon: [],
              evening: [],
            },
          },
        ],
      },
    });
    expect(model.labels.navigate).toBe("Navigiraj");
    expect(model.days[0]!.slots[0]!.items[0]!.title).toBe("Wat Phra Kaew");
    expect(model.days[0]!.slots[0]!.items[0]!.description).toMatch(/pogledom na reko/);
  });

  it("drops placeholder and ellipsis activities from the PDF model", () => {
    const model = normalizePlanForPdf({
      title: "MUC → CDG",
      destination: "Pariz",
      start_date: "2026-07-24",
      end_date: "2026-07-28",
      language: "sl",
      itinerary: {
        summary: "Kratek izlet v Pariz.",
        days: [
          {
            day: 2,
            city: "Paris",
            title: "Pariz",
            activities: {
              morning: [
                { name: "TODO", description: "Coming soon..." },
                {
                  name: "Jutranji sprehod ob Seni in ogled Notre-Dame",
                  description:
                    "Začni pri Notre-Dame parvisu. Nato preči Senno do Sainte-Chapelle in kupi časovno okno, da se izogneš vrsti pred vstopom.",
                },
              ],
              afternoon: [{ name: "Visit the gardens...", description: "TBD" }],
              evening: [],
            },
          },
        ],
      },
    });
    const titles = model.days[0]!.slots.flatMap((s) => s.items.map((i) => i.title));
    expect(titles).toContain("Jutranji sprehod ob Seni in ogled Notre-Dame");
    expect(titles.some((t) => /TODO|Visit the gardens/i.test(t))).toBe(false);
  });

  it("omits evening when there is a title but no description", () => {
    const model = normalizePlanForPdf({
      title: "MUC → CDG",
      destination: "Pariz",
      start_date: "2026-07-24",
      end_date: "2026-07-28",
      language: "sl",
      itinerary: {
        summary: "Kratek izlet v Pariz.",
        days: [
          {
            day: 2,
            city: "Paris",
            title: "Pariz",
            activities: {
              morning: [
                {
                  name: "Jutranji sprehod ob Seni in ogled Notre-Dame",
                  description:
                    "Začni pri Notre-Dame parvisu. Nato preči Senno do Sainte-Chapelle in kupi časovno okno.",
                },
              ],
              afternoon: [],
              evening: [{ name: "Večerja v Maraisu" }],
            },
          },
        ],
      },
    });
    expect(model.days[0]!.slots.map((s) => s.label)).toEqual(["Dopoldan"]);
    expect(model.days[0]!.slots.flatMap((s) => s.items.map((i) => i.title))).not.toContain(
      "Večerja v Maraisu",
    );
  });

  it("omits empty evening fallbacks that would print Večer: Večer", () => {
    const fromStructured = normalizePlanForPdf({
      title: "MUC → CDG",
      destination: "Pariz",
      start_date: "2026-10-17",
      end_date: "2026-10-31",
      language: "sl",
      itinerary: {
        summary: "Petnajstdnevni izlet v Pariz.",
        days: [
          {
            day: 2,
            city: "Paris",
            title: "Pariz",
            activities: {
              morning: [
                {
                  name: "Jutranji sprehod ob Seni in ogled Notre-Dame",
                  description:
                    "Začni pri Notre-Dame parvisu. Nato preči Senno do Sainte-Chapelle in kupi časovno okno.",
                },
              ],
              afternoon: [],
              evening: [{ name: "Večer", description: "Večer" }],
            },
          },
        ],
      },
    });
    expect(fromStructured.days[0]!.slots.map((s) => s.label)).toEqual(["Dopoldan"]);
    expect(JSON.stringify(fromStructured.days[0]!.slots)).not.toMatch(/Večer:\s*Večer/);

    const fromLegacyBlob = normalizePlanForPdf({
      title: "MUC → CDG",
      destination: "Pariz",
      start_date: "2026-10-17",
      end_date: "2026-10-31",
      language: "sl",
      itinerary: {
        summary: "Petnajstdnevni izlet v Pariz.",
        days: [
          {
            day: 2,
            city: "Paris",
            title: "Pariz",
            evening: "Večer: Večer",
          },
        ],
      },
    });
    expect(fromLegacyBlob.days[0]!.slots.some((s) => s.label === "Večer")).toBe(false);
    expect(
      fromLegacyBlob.days[0]!.slots.flatMap((s) => s.items.map((i) => i.title)),
    ).not.toContain("Večer: Večer");
  });

  it("uses the model day.title instead of Dan N in the day band", () => {
    const model = normalizePlanForPdf({
      title: "Bali",
      destination: "Bali",
      start_date: "2026-07-24",
      language: "sl",
      itinerary: {
        days: [
          {
            day: 1,
            date: "2026-07-24",
            title: "Riževe terase in Ubud",
            city: "Ubud",
          },
          {
            day: 2,
            date: "2026-07-25",
            title: "Dan 2",
            city: "Nusa Lembongan",
          },
        ],
      },
    });
    expect(model.days[0]?.title).toBe("Riževe terase in Ubud");
    expect(model.days[1]?.title).toBe("Nusa Lembongan");
    expect(model.days.map((d) => d.title).join(" ")).not.toMatch(/\bDan\s+\d+\b/);
  });

  it("splits NAMESTITVE by overnight bases instead of one gateway-city row", () => {
    const start = "2026-07-24";
    const model = normalizePlanForPdf({
      title: "Bali",
      destination: "Bali",
      start_date: start,
      end_date: "2026-08-07",
      language: "sl",
      itinerary: {
        originPlace: "München",
        hotels: [
          { city: "Seminyak", nights: 3 },
          { city: "Ubud", nights: 2 },
          { city: "Nusa Lembongan", nights: 2 },
          { city: "Amed", nights: 2 },
          { city: "Lovina", nights: 2 },
          { city: "Canggu", nights: 3 },
        ],
        days: Array.from({ length: 15 }, (_, i) => ({
          day: i + 1,
          date: isoAddDays("2026-07-24", i),
          title: `Dan ${i + 1}`,
          city: "Denpasar",
        })),
      },
    });

    expect(model.hotels.map((h) => h.text)).toEqual([
      expect.stringMatching(/Seminyak.*3 noči/),
      expect.stringMatching(/Ubud.*2 noči/),
      expect.stringMatching(/Nusa Lembongan.*2 noči/),
      expect.stringMatching(/Amed.*2 noči/),
      expect.stringMatching(/Lovina.*2 noči/),
      expect.stringMatching(/Canggu.*3 noči/),
    ]);
    expect(model.hotels.map((h) => h.text).join(" ")).not.toMatch(/Denpasar.*14 noči/);
    expect(model.days[3]?.city).toBe("Ubud");
    expect(model.days[5]?.city).toBe("Nusa Lembongan");
    expect(model.days[3]?.title).toBe("Ubud");
  });

  it("labels a late Bangkok→Chiang Mai hop-day as Chiang Mai and splits NAMESTITVE by sleep nights", () => {
    const model = normalizePlanForPdf({
      title: "MUC → BKK",
      destination: "Tajska",
      start_date: "2026-10-26",
      end_date: "2026-10-31",
      language: "sl",
      itinerary: {
        originPlace: "München",
        days: [
          {
            day: 1,
            date: "2026-10-26",
            title: "Prihod",
            city: "Bangkok",
            activities: { evening: [{ name: "Yaowarat" }] },
          },
          {
            day: 2,
            date: "2026-10-27",
            title: "Grand Palace",
            city: "Bangkok",
            activities: { morning: [{ name: "Grand Palace" }] },
          },
          {
            day: 3,
            date: "2026-10-28",
            title: "Wat Pho in Chinatown",
            city: "Chiang Mai",
            transportation: [{ type: "flight", from: "Bangkok", to: "Chiang Mai" }],
            activities: {
              morning: [{ name: "Wat Pho" }],
              afternoon: [{ name: "Chinatown" }],
              evening: [{ name: "Let v Chiang Mai", type: "TRANSPORT" }],
            },
          },
          { day: 4, date: "2026-10-29", title: "Staro mesto", city: "Chiang Mai" },
          { day: 5, date: "2026-10-30", title: "Doi Suthep", city: "Chiang Mai" },
          { day: 6, date: "2026-10-31", title: "Odhod", city: "Chiang Mai" },
        ],
      },
    });
    expect(model.days[2]?.city).toMatch(/Chiang Mai/i);
    expect(model.hotels.map((h) => h.text)).toEqual([
      expect.stringMatching(/Bangkok.*2 noč.*26\.\s*okt.*28\.\s*okt/i),
      expect.stringMatching(/Chiang Mai.*3 noč.*28\.\s*okt.*31\.\s*okt/i),
    ]);
  });

  it("labels a morning Shinkansen hop as Tokyo and splits NAMESTITVE Osaka 2 / Tokyo 5", () => {
    const model = normalizePlanForPdf({
      title: "MUC → KIX",
      destination: "Japonska",
      start_date: "2026-09-20",
      end_date: "2026-09-27",
      language: "sl",
      itinerary: {
        originPlace: "München",
        days: [
          { day: 1, date: "2026-09-20", title: "Osaka", city: "Osaka" },
          { day: 2, date: "2026-09-21", title: "Osaka", city: "Osaka" },
          {
            day: 3,
            date: "2026-09-22",
            title: "Osaka",
            city: "Osaka",
            transportation: [{ type: "train", from: "Osaka", to: "Tokyo" }],
            activities: {
              morning: [{ name: "Shinkansen iz Osake v Tokio", type: "TRANSPORT" }],
              afternoon: [{ name: "Shinjuku" }],
              evening: [{ name: "Ginza" }],
            },
          },
          { day: 4, date: "2026-09-23", title: "Ghibli", city: "Osaka" },
          { day: 5, date: "2026-09-24", title: "Asakusa", city: "Osaka" },
          { day: 6, date: "2026-09-25", title: "Tsukiji", city: "Osaka" },
          { day: 7, date: "2026-09-26", title: "Shibuya", city: "Osaka" },
          { day: 8, date: "2026-09-27", title: "Odhod", city: "Osaka" },
        ],
      },
    });
    expect(model.days[2]?.city).toMatch(/Tokyo/i);
    expect(model.days[3]?.city).toMatch(/Tokyo/i);
    expect(model.days[6]?.city).toMatch(/Tokyo/i);
    expect(model.hotels.map((h) => h.text)).toEqual([
      expect.stringMatching(/Osaka.*2 noč.*20\.\s*sep.*22\.\s*sep/i),
      expect.stringMatching(/Tokyo.*5 noč.*22\.\s*sep.*27\.\s*sep/i),
    ]);
  });

  it("hides same-city outing banners and keeps a real base-change hop", () => {
    const model = normalizePlanForPdf({
      title: "MUC → YYZ",
      destination: "Kanada",
      start_date: "2026-07-24",
      language: "sl",
      itinerary: {
        originIata: "MUC",
        destinationIata: "YYZ",
        days: [
          {
            day: 13,
            date: "2026-08-05",
            title: "Vancouver",
            city: "Vancouver",
            transportation: [{ type: "train", from: "Vancouver", to: "Vancouver", duration: "2h" }],
          },
          {
            day: 14,
            date: "2026-08-06",
            title: "Ogledi v Vancouverju",
            city: "Vancouver",
            transportation: [
              { type: "train", from: "Vancouver", to: "Grouse Mountain", duration: "45min" },
              { type: "van", from: "Vancouver", to: "YVR", duration: "30min" },
            ],
          },
        ],
      },
    });
    expect(model.days[0]?.transportation).toEqual([]);
    expect(model.days[1]?.transportation).toEqual([]);
  });

  it("keeps an intercity hop and a last-day flight home", () => {
    const model = normalizePlanForPdf({
      title: "MUC → YYZ",
      destination: "Kanada",
      start_date: "2026-07-24",
      language: "sl",
      itinerary: {
        originIata: "MUC",
        destinationIata: "YYZ",
        days: [
          {
            day: 8,
            date: "2026-07-31",
            title: "Toronto",
            city: "Toronto",
          },
          {
            day: 9,
            date: "2026-08-01",
            title: "Let v Vancouver",
            city: "Vancouver",
            transportation: [{ type: "flight", from: "YYZ", to: "YVR", duration: "5h" }],
          },
          {
            day: 14,
            date: "2026-08-06",
            title: "Odhod",
            city: "Vancouver",
            transportation: [{ type: "flight", from: "YVR", to: "MUC", duration: "10h" }],
          },
        ],
      },
    });
    expect(model.days[1]?.transportation[0]).toMatchObject({ from: "YYZ", to: "YVR" });
    expect(model.days[2]?.transportation[0]).toMatchObject({ from: "YVR", to: "MUC" });
  });

  it("collapses duplicate same-day transfer banners and omits placeholder 1h", () => {
    const model = normalizePlanForPdf({
      title: "BKK → MUC",
      destination: "Tajska",
      start_date: "2026-07-24",
      end_date: "2026-08-07",
      language: "sl",
      itinerary: {
        originIata: "MUC",
        destinationIata: "BKK",
        days: [
          {
            day: 1,
            date: "2026-07-24",
            title: "Prihod",
            city: "Bangkok",
          },
          {
            day: 14,
            date: "2026-08-07",
            title: "Odhod",
            city: "Bangkok",
            transportation: [
              { type: "flight", from: "Bangkok", to: "München", duration: "1h" },
              { type: "flight", from: "Bangkok", to: "München", duration: "1h" },
              { type: "flight", from: "BKK", to: "MUC" },
            ],
          },
        ],
      },
    });
    const last = model.days[model.days.length - 1]!;
    expect(last.transportation).toHaveLength(1);
    expect(last.transportation[0]!.from).toMatch(/Bangkok|BKK/i);
    expect(last.transportation[0]!.to).toMatch(/München|Munich|MUC/i);
    expect(last.transportation[0]!.duration).toBeUndefined();
  });

  it("keeps a real duration when duplicate hops include one measured time", () => {
    const model = normalizePlanForPdf({
      title: "BKK → MUC",
      destination: "Tajska",
      start_date: "2026-07-24",
      end_date: "2026-08-07",
      language: "sl",
      itinerary: {
        originIata: "MUC",
        destinationIata: "BKK",
        days: [
          {
            day: 1,
            date: "2026-07-24",
            title: "Prihod",
            city: "Bangkok",
          },
          {
            day: 14,
            date: "2026-08-07",
            title: "Odhod",
            city: "Bangkok",
            transportation: [
              { type: "flight", from: "Bangkok", to: "München", duration: "1h" },
              { type: "flight", from: "BKK", to: "MUC", duration: "11h" },
              { type: "van", from: "Bangkok", to: "München", duration: "1h" },
            ],
          },
        ],
      },
    });
    const last = model.days[model.days.length - 1]!;
    expect(last.transportation).toHaveLength(1);
    expect(last.transportation[0]!.type.toLowerCase()).toBe("flight");
    expect(last.transportation[0]!.duration).toBe("11h");
  });

  it("prints open-jaw return from the last overnight hub, not the arrival IATA", () => {
    const model = normalizePlanForPdf({
      title: "MUC → YYZ",
      destination: "Kanada",
      start_date: "2026-07-24",
      end_date: "2026-08-07",
      language: "sl",
      pax: 2,
      itinerary: {
        originIata: "MUC",
        destinationIata: "YYZ",
        originPlace: "München",
        flightEur: 1200,
        flights: [
          { from: "MUC", to: "YYZ", date: "2026-07-24", airline: "10:00" },
          { from: "YYZ", to: "MUC", date: "2026-08-07", airline: "16:00" },
        ],
        days: [
          { day: 1, date: "2026-07-24", title: "Prihod", city: "Toronto" },
          { day: 10, date: "2026-08-02", title: "Vancouver", city: "Vancouver" },
          { day: 14, date: "2026-08-06", title: "Zadnji dan", city: "Vancouver" },
          { day: 15, date: "2026-08-07", title: "Odhod", city: "Vancouver" },
        ],
      },
    });
    expect(model.flights.some((f) => /MUC\s*→\s*YYZ/.test(f))).toBe(true);
    expect(model.flights.some((f) => /YVR\s*→\s*MUC/.test(f))).toBe(true);
    expect(model.flights.join(" ")).not.toMatch(/YYZ\s*→\s*MUC/);
  });
});

describe("pdfDayHeading", () => {
  it("keeps a real title and falls back from Dan N to the overnight city", () => {
    expect(pdfDayHeading("Snorkljanje pri Nusa Lembongan", "Nusa Lembongan")).toBe(
      "Snorkljanje pri Nusa Lembongan",
    );
    expect(pdfDayHeading("Dan 4", "Amed")).toBe("Amed");
    expect(pdfDayHeading("Day 1", "Seminyak")).toBe("Seminyak");
  });
});

describe("isPdfBaseTransferLeg", () => {
  it("drops same-base outings and keeps a hop between two cities", () => {
    expect(
      isPdfBaseTransferLeg(
        { type: "train", from: "Vancouver", to: "Grouse Mountain" },
        { dayCity: "Vancouver", prevCity: "Vancouver" },
      ),
    ).toBe(false);
    expect(
      isPdfBaseTransferLeg(
        { type: "flight", from: "YYZ", to: "YVR" },
        { dayCity: "Vancouver", prevCity: "Toronto" },
      ),
    ).toBe(true);
    expect(
      isPdfBaseTransferLeg(
        { type: "flight", from: "MNL", to: "ENI" },
        { dayCity: "El Nido", prevCity: "Manila" },
      ),
    ).toBe(true);
    expect(
      isPdfBaseTransferLeg(
        { type: "flight", from: "Cancún (CUN)", to: "Hotel zona Cancún" },
        { dayCity: "Cancún" },
      ),
    ).toBe(false);
    expect(
      isPdfBaseTransferLeg(
        { type: "ferry", from: "Phuket", to: "Koh Phi Phi" },
        { dayCity: "Phuket", prevCity: "Phuket" },
      ),
    ).toBe(false);
    expect(
      isPdfBaseTransferLeg(
        { type: "van", from: "Suvarnabhumi", to: "Bangkok" },
        { dayNumber: 1, originIata: "MUC", destinationIata: "BKK", dayCity: "Bangkok" },
      ),
    ).toBe(false);
  });
});

describe("resolvePdfReturnFromIata", () => {
  it("uses the last overnight hub instead of the arrival ticket city", () => {
    expect(
      resolvePdfReturnFromIata({
        originIata: "MUC",
        destinationIata: "YYZ",
        days: [
          { city: "Toronto" },
          { city: "Vancouver" },
          { city: "Vancouver" },
        ],
      }),
    ).toBe("YVR");
  });
});

describe("buildPdfDownloadFileName", () => {
  it("names a flight plan from route and destination, not Unknown", () => {
    expect(buildPdfDownloadFileName("MUC → MNL", "Manila, Filipini")).toBe(
      "Skybooplan_MUC-MNL_Manila_Filipini.pdf",
    );
  });

  it("falls back to travel_plan instead of an empty name", () => {
    expect(buildPdfDownloadFileName("", "")).toBe("Skybooplan_travel_plan.pdf");
  });
});
