import { describe, expect, it } from "vitest";
import { buildSkeletonDayPlans, type TripSkeleton } from "@/lib/aiPlan.functions";
import { lookupCuratedTransportLeg } from "@/lib/curatedRoutes";

const FLIGHTS = {
  outboundDepart: "20:00",
  outboundArrive: "22:10",
  outboundArriveDayOffset: 1,
  inboundDepart: "13:15",
};

function thailandHopSkeleton(): TripSkeleton {
  return {
    destinationName: "Tajska",
    summary: "",
    totalBudgetEur: 800,
    originIata: "LJU",
    destinationIata: "BKK",
    departDate: "2026-11-14",
    regions: [
      {
        city: "Bangkok",
        startDay: 2,
        endDay: 3,
        startDate: "2026-11-15",
        endDate: "2026-11-16",
        summary: "Bangkok",
        localTransportTips: "BTS",
        travelTips: "",
        highlights: [
          {
            day: 3,
            name: "Asiatique",
            description: "Večer ob reki.",
            priceLabel: "—",
            lat: 13.72,
            lng: 100.51,
          },
        ],
        lat: 13.75,
        lng: 100.5,
        transportToNext: {
          type: "train",
          duration: "1h",
          costLabel: "10 €",
          howTo: "AI generic hop",
        },
      },
      {
        city: "Ayutthaya",
        startDay: 4,
        endDay: 4,
        startDate: "2026-11-17",
        endDate: "2026-11-17",
        summary: "Zgodovinsko mesto",
        localTransportTips: "Kolo",
        travelTips: "",
        highlights: [
          {
            day: 4,
            name: "Wat Mahathat",
            description: "Tempelj.",
            priceLabel: "50 THB",
            lat: 14.35,
            lng: 100.57,
          },
        ],
        lat: 14.35,
        lng: 100.57,
      },
      {
        city: "Krabi",
        startDay: 7,
        endDay: 8,
        startDate: "2026-11-20",
        endDate: "2026-11-21",
        summary: "Obala",
        localTransportTips: "",
        travelTips: "",
        highlights: [],
        lat: 8.05,
        lng: 98.92,
        transportToNext: {
          type: "ferry",
          duration: "4h",
          costLabel: "40 €",
          howTo: "Rezervirajte trajekt iz Krabi do Koh Lipe.",
        },
      },
      {
        city: "Koh Lipe",
        startDay: 9,
        endDay: 10,
        startDate: "2026-11-22",
        endDate: "2026-11-23",
        summary: "Otok",
        localTransportTips: "",
        travelTips: "",
        highlights: [],
        lat: 6.49,
        lng: 99.3,
      },
    ],
  };
}

describe("curated transport legs", () => {
  it("Krabi → Koh Lipe uses Pakbara ferry copy", () => {
    const leg = lookupCuratedTransportLeg("Krabi", "Koh Lipe", "TH");
    expect(leg?.howTo).toMatch(/Pakbara/i);
    expect(leg?.type).toBe("ferry");
  });
});

function thailand21DaySkeleton(): TripSkeleton {
  const mkRegion = (
    city: string,
    startDay: number,
    endDay: number,
    highlights: TripSkeleton["regions"][0]["highlights"] = [],
    transportToNext?: TripSkeleton["regions"][0]["transportToNext"],
  ): TripSkeleton["regions"][0] => ({
    city,
    startDay,
    endDay,
    startDate: `2026-11-${String(startDay + 12).padStart(2, "0")}`,
    endDate: `2026-11-${String(endDay + 12).padStart(2, "0")}`,
    summary: city,
    localTransportTips: "",
    travelTips: "",
    highlights,
    lat: city === "Koh Lipe" ? 6.49 : city === "Krabi" ? 8.05 : 13.75,
    lng: city === "Koh Lipe" ? 99.3 : city === "Krabi" ? 98.92 : 100.5,
    transportToNext,
  });

  return {
    destinationName: "Tajska",
    summary: "",
    totalBudgetEur: 2400,
    originIata: "MXP",
    destinationIata: "BKK",
    departDate: "2026-11-14",
    regions: [
      mkRegion("Bangkok", 2, 3, [
        { day: 3, name: "Wat Pho", description: "Tempelj.", priceLabel: "—", lat: 13.75, lng: 100.49 },
      ], { type: "train", duration: "1h", howTo: "Vlak do Ayutthaya." }),
      mkRegion("Ayutthaya", 4, 4, [
        { day: 4, name: "Wat Mahathat", description: "UNESCO.", priceLabel: "—", lat: 14.35, lng: 100.57 },
      ], { type: "flight", duration: "1h", howTo: "Let do Chiang Mai." }),
      mkRegion("Chiang Mai", 5, 6, [
        {
          day: 5,
          name: "Prevoz: Ayutthaya → Chiang Mai",
          description: "Celodnevni prevoz — notranji let.",
          priceLabel: "80 €",
          lat: 18.8,
          lng: 98.98,
        },
        { day: 6, name: "Doi Suthep", description: "Tempelj.", priceLabel: "—", lat: 18.8, lng: 98.92 },
      ], { type: "flight", duration: "2h", howTo: "Let do Krabi." }),
      mkRegion("Krabi", 7, 12, [
        {
          day: 7,
          name: "Prevoz: Chiang Mai → Krabi",
          description: "Celodnevni prevoz — notranji let.",
          priceLabel: "120 €",
          lat: 8.05,
          lng: 98.92,
        },
        { day: 8, name: "Railay Beach", description: "Plaže.", priceLabel: "—", lat: 8.01, lng: 98.84 },
        { day: 10, name: "Koh Phi Phi", description: "Izlet.", priceLabel: "—", lat: 7.74, lng: 98.77 },
      ], { type: "ferry", duration: "4h", howTo: "Trajekt iz Pakbara do Koh Lipe." }),
      mkRegion("Koh Lipe", 13, 19, [
        { day: 14, name: "Sunrise Beach", description: "Snorkl.", priceLabel: "—", lat: 6.49, lng: 99.3 },
      ], { type: "flight", duration: "2h", howTo: "Let do Bangkoka." }),
      mkRegion("Bangkok", 20, 21, [
        {
          day: 20,
          name: "Prevoz: Koh Lipe → Bangkok",
          description: "Celodnevni prevoz — let in transfer.",
          priceLabel: "150 €",
          lat: 13.75,
          lng: 100.5,
        },
        { day: 21, name: "Chatuchak", description: "Tržnica.", priceLabel: "—", lat: 13.8, lng: 100.55 },
      ]),
    ],
  };
}

describe("buildSkeletonDayPlans — short hops & in-flight", () => {
  it("marks day 1 in-flight without hotel flag data", () => {
    const days = buildSkeletonDayPlans(thailandHopSkeleton(), {
      flights: FLIGHTS,
      lang: "sl",
      destinationIata: "BKK",
      pax: 2,
    });
    const day1 = days.find((d) => d.day === 1);
    expect(day1?.inFlightDay).toBe(true);
    expect(day1?.title).toBe("Mednarodni let");
  });

  it("shows Bangkok → Ayutthaya as transport on Ayutthaya arrival day", () => {
    const days = buildSkeletonDayPlans(thailandHopSkeleton(), {
      flights: FLIGHTS,
      lang: "sl",
      destinationIata: "BKK",
      pax: 2,
    });
    const ayut = days.find((d) => d.day === 4);
    expect(ayut?.transport?.description).toMatch(/Bangkok|Ayutthaya|izlet|vlak|train/i);
    const morning = ayut?.activities?.morning ?? [];
    expect(morning.some((a) => /prevoz:.*bangkok.*ayutthaya/i.test(a.name))).toBe(true);
  });

  it("builds long Thailand skeleton without stack overflow (regression)", () => {
    const days = buildSkeletonDayPlans(thailand21DaySkeleton(), {
      flights: { outboundDepart: "20:00", outboundArrive: "22:10", outboundArriveDayOffset: 1, inboundDepart: "13:15" },
      lang: "sl",
      destinationIata: "BKK",
      pax: 2,
    });
    expect(days.length).toBeGreaterThan(10);
    expect(Math.max(...days.map((d) => d.day))).toBeLessThanOrEqual(21);
    expect(days.some((d) => d.transport?.description || d.activities?.morning.some((a) => /prevoz:/i.test(a.name)))).toBe(
      true,
    );
  });

  it("overrides Krabi → Koh Lipe ferry text with Pakbara leg", () => {
    const skeleton = thailandHopSkeleton();
    const days = buildSkeletonDayPlans(skeleton, {
      flights: FLIGHTS,
      lang: "sl",
      destinationIata: "BKK",
      pax: 2,
    });
    const lipeArrival = days.find((d) => d.day === 9);
    expect(lipeArrival?.transport?.description).toMatch(/Pakbara/i);
  });
});
