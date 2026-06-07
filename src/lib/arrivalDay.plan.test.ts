import { describe, expect, it } from "vitest";
import { buildSkeletonDayPlans, type TripSkeleton } from "@/lib/aiPlan.functions";
import { findDuplicateCitySegments } from "@/lib/planValidation";

const BKK_FLIGHTS = {
  outboundDepart: "11:00",
  outboundArrive: "15:25",
  outboundArriveDayOffset: 1,
  inboundDepart: "23:00",
};

function thailandSkeleton(): TripSkeleton {
  return {
    destinationName: "Tajska",
    summary: "18-dnevna pot po Tajski",
    totalBudgetEur: 2400,
    originIata: "LJU",
    destinationIata: "BKK",
    returnFromIata: "BKK",
    departDate: "2026-07-26",
    returnDate: "2026-08-12",
    regions: [
      {
        city: "Bangkok",
        startDay: 2,
        endDay: 3,
        startDate: "2026-07-27",
        endDate: "2026-07-28",
        summary: "Prihod in kratka raziskava Bangkoka.",
        localTransportTips: "BTS / MRT",
        travelTips: "",
        highlights: [
          {
            day: 3,
            name: "Grand Palace",
            description: "Glavna znamenitost.",
            priceLabel: "500 THB",
            lat: 13.75,
            lng: 100.49,
          },
        ],
        lat: 13.75,
        lng: 100.5,
        transportToNext: {
          type: "train",
          duration: "2h",
          howTo: "Ayutthaya",
        },
      },
      {
        city: "Ayutthaya",
        startDay: 4,
        endDay: 4,
        startDate: "2026-07-29",
        endDate: "2026-07-29",
        summary: "Zgodovinsko mesto.",
        localTransportTips: "",
        travelTips: "",
        highlights: [
          {
            day: 4,
            name: "Ayutthaya Historical Park",
            description: "UNESCO ruševine.",
            priceLabel: "50 THB",
            lat: 14.35,
            lng: 100.57,
          },
        ],
        lat: 14.35,
        lng: 100.57,
        transportToNext: {
          type: "flight",
          duration: "1h 30m",
          howTo: "Chiang Mai",
        },
      },
      {
        city: "Chiang Mai",
        startDay: 5,
        endDay: 6,
        startDate: "2026-07-30",
        endDate: "2026-07-31",
        summary: "Sever Tajlandije.",
        localTransportTips: "",
        travelTips: "",
        highlights: [
          {
            day: 5,
            name: "Doi Suthep",
            description: "Tempelj na hribu.",
            priceLabel: "30 THB",
            lat: 18.8,
            lng: 98.92,
          },
        ],
        lat: 18.8,
        lng: 98.98,
        transportToNext: {
          type: "flight",
          duration: "2h",
          howTo: "Krabi",
        },
      },
      {
        city: "Krabi",
        startDay: 7,
        endDay: 9,
        startDate: "2026-08-01",
        endDate: "2026-08-03",
        summary: "Andamanska obala.",
        localTransportTips: "",
        travelTips: "",
        highlights: [
          {
            day: 8,
            name: "Railay Beach",
            description: "Apneji in plaže.",
            priceLabel: "—",
            lat: 8.01,
            lng: 98.84,
          },
        ],
        lat: 8.05,
        lng: 98.92,
        transportToNext: {
          type: "ferry",
          duration: "5h",
          howTo: "Koh Lipe",
        },
      },
      {
        city: "Koh Lipe",
        startDay: 10,
        endDay: 14,
        startDate: "2026-08-04",
        endDate: "2026-08-08",
        summary: "Otok na jugu.",
        localTransportTips: "",
        travelTips: "",
        highlights: [
          {
            day: 11,
            name: "Sunrise Beach",
            description: "Snorkliranje.",
            priceLabel: "—",
            lat: 6.49,
            lng: 99.3,
          },
        ],
        lat: 6.49,
        lng: 99.3,
        transportToNext: {
          type: "flight",
          duration: "2h",
          howTo: "Bangkok",
        },
      },
      {
        city: "Bangkok",
        startDay: 15,
        endDay: 16,
        startDate: "2026-08-09",
        endDate: "2026-08-10",
        summary: "Buffer pred odletom.",
        localTransportTips: "",
        travelTips: "",
        highlights: [],
        lat: 13.75,
        lng: 100.5,
      },
    ],
  };
}

describe("Thailand reference — arrival day + hub return", () => {
  it("day 1 in-flight, day 2 afternoon landing without pre-landing breakfast", () => {
    const days = buildSkeletonDayPlans(thailandSkeleton(), {
      flights: BKK_FLIGHTS,
      lang: "sl",
      destinationIata: "BKK",
      destinationName: "Tajska",
      pax: 2,
    });

    const day1 = days.find((d) => d.day === 1);
    const day2 = days.find((d) => d.day === 2);
    expect(day1?.activities?.morning[0]?.name).toMatch(/odhod.*LJU|ljubljana/i);
    expect(day1?.travelHack).toMatch(/Parkvia|LJU/i);
    expect(day2).toBeDefined();

    const morning = day2!.activities?.morning ?? [];
    const allDay2 = [
      ...morning,
      ...(day2!.activities?.afternoon ?? []),
      ...(day2!.activities?.evening ?? []),
    ];
    expect(morning).toHaveLength(0);
    expect(allDay2.some((a) => /zajtrk|breakfast/i.test(a.name))).toBe(false);
    expect(allDay2.some((a) => /klimatiziranem kavarni/i.test(a.name))).toBe(false);
    expect(allDay2.some((a) => /prihod na letališče/i.test(a.name))).toBe(true);
    expect(allDay2.some((a) => /15:25/i.test(a.description ?? ""))).toBe(true);
  });

  it("allows Bangkok hub at start (day 2) and return (day 15+)", () => {
    const days = buildSkeletonDayPlans(thailandSkeleton(), {
      flights: BKK_FLIGHTS,
      lang: "sl",
      destinationIata: "BKK",
      destinationName: "Tajska",
    });
    const plan = {
      destinationName: "Tajska",
      summary: "",
      totalBudgetEur: 0,
      centerLat: 13.75,
      centerLng: 100.5,
      days,
    };
    expect(findDuplicateCitySegments(plan)).toEqual([]);
  });
});
