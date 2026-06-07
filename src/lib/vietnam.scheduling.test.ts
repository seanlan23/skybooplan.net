import { describe, expect, it } from "vitest";
import { buildSkeletonDayPlans, type TripSkeleton } from "@/lib/aiPlan.functions";
import { isOvernightDeparture, isTightArrivalDay } from "@/lib/flightScheduling";
import { enrichDayActivities } from "@/lib/dayEnrichers";
import { resolveTripLocale } from "@/lib/tripLocale";

const VN_FLIGHTS = {
  outboundDepart: "10:00",
  outboundArrive: "01:35",
  outboundArriveDayOffset: 2,
  inboundDepart: "03:35",
};

function vietnamSkeleton(): TripSkeleton {
  return {
    destinationName: "Vietnam",
    summary: "14-dnevna pot",
    totalBudgetEur: 2800,
    originIata: "LJU",
    destinationIata: "SGN",
    returnFromIata: "HAN",
    departDate: "2026-09-01",
    returnDate: "2026-09-14",
    regions: [
      {
        city: "Ho Chi Minh City",
        startDay: 3,
        endDay: 5,
        startDate: "2026-09-03",
        endDate: "2026-09-05",
        summary: "Saigon",
        localTransportTips: "Grab",
        travelTips: "",
        highlights: [
          {
            day: 3,
            name: "War Remnants Museum",
            description: "Muzej vojnih ostankov — zgodovina Vietnam War.",
            priceLabel: "40 000 VND",
            lat: 10.779,
            lng: 106.692,
          },
          {
            day: 4,
            name: "Cu Chi Tunnels",
            description: "Pol dneva — rovovi.",
            priceLabel: "150 000 VND",
            lat: 11.152,
            lng: 106.494,
          },
        ],
        lat: 10.823,
        lng: 106.629,
        transportToNext: { type: "flight", duration: "1h", howTo: "Hoi An" },
      },
      {
        city: "Hoi An",
        startDay: 6,
        endDay: 9,
        startDate: "2026-09-06",
        endDate: "2026-09-09",
        summary: "Hoi An",
        localTransportTips: "",
        travelTips: "",
        highlights: [
          {
            day: 8,
            name: "An Bang Beach",
            description: "Sproščen dan na plaži An Bang.",
            priceLabel: "—",
            lat: 15.91,
            lng: 108.35,
          },
          {
            day: 9,
            name: "An Bang Beach",
            description: "Sproščen dan na plaži An Bang.",
            priceLabel: "—",
            lat: 15.91,
            lng: 108.35,
          },
        ],
        lat: 15.88,
        lng: 108.338,
        transportToNext: { type: "train", duration: "3h", howTo: "Hanoi" },
      },
      {
        city: "Hanoi",
        startDay: 10,
        endDay: 14,
        startDate: "2026-09-10",
        endDate: "2026-09-14",
        summary: "Hanoi",
        localTransportTips: "",
        travelTips: "",
        highlights: [
          {
            day: 13,
            name: "Hoan Kiem Lake",
            description: "Jezero in tempelj.",
            priceLabel: "30 000 VND",
            lat: 21.028,
            lng: 105.852,
          },
          {
            day: 14,
            name: "Imperial Citadel of Thang Long",
            description: "UNESCO trdnjava.",
            priceLabel: "30 000 VND",
            lat: 21.036,
            lng: 105.84,
          },
        ],
        lat: 21.028,
        lng: 105.854,
      },
    ],
  };
}

describe("Vietnam flight scheduling", () => {
  it("treats 01:35 red-eye as tight arrival", () => {
    expect(isTightArrivalDay(VN_FLIGHTS)).toBe(true);
    expect(isOvernightDeparture(VN_FLIGHTS)).toBe(true);
  });

  it("day 3 HCMC: recovery before museums after 01:35 landing", () => {
    const days = buildSkeletonDayPlans(vietnamSkeleton(), {
      flights: VN_FLIGHTS,
      lang: "sl",
      destinationIata: "SGN",
      destinationName: "Vietnam",
    });
    const day3 = days.find((d) => d.day === 3);
    expect(day3).toBeDefined();
    const morning = day3!.activities?.morning ?? [];
    const afternoon = day3!.activities?.afternoon ?? [];
    const all = [...morning, ...afternoon, ...(day3!.activities?.evening ?? [])];
    expect(morning.some((a) => /prihod na letališče|check-in|počit/i.test(`${a.name} ${a.description}`))).toBe(
      true,
    );
    expect(morning.some((a) => /war remnants|muzej vojnih/i.test(a.name))).toBe(false);
    expect(afternoon.some((a) => /check-in|počit|osvežitev/i.test(`${a.name} ${a.description}`))).toBe(true);
    expect(all.some((a) => /war remnants|muzej vojnih/i.test(a.name))).toBe(false);
    const day4 = days.find((d) => d.day === 4);
    expect(day4?.activities?.morning.some((a) => /war remnants|cu chi/i.test(a.name)) ?? false).toBe(true);
  });

  it("shifts Thang Long from overnight departure day 14 to day 13", () => {
    const days = buildSkeletonDayPlans(vietnamSkeleton(), {
      flights: VN_FLIGHTS,
      lang: "sl",
      destinationIata: "SGN",
      destinationName: "Vietnam",
    });
    const day13 = days.find((d) => d.day === 13);
    const day14 = days.find((d) => d.day === 14);
    expect(day13?.activities?.morning.some((a) => /thang long|trdnjava/i.test(a.name)) ?? false).toBe(
      true,
    );
    expect(day14?.title).toMatch(/odhod|letališč/i);
    const day14Sights = [
      ...(day14?.activities?.morning ?? []),
      ...(day14?.activities?.afternoon ?? []),
      ...(day14?.activities?.evening ?? []),
    ].filter((a) => a.type === "SIGHT");
    expect(day14Sights).toHaveLength(0);
  });

  it("dedupes An Bang across Hoi An evening then next morning", () => {
    const locale = resolveTripLocale("DAD", "Vietnam", "sl");
    const day8 = enrichDayActivities(
      {
        morning: [],
        afternoon: [],
        evening: [
          {
            name: "An Bang Beach",
            type: "SIGHT",
            description: "Sproščen dan na plaži An Bang.",
          },
        ],
      },
      "Hoi An",
      3,
      locale,
      { tripDate: "2026-03-08", priorScheduledText: "" },
    );
    const day9 = enrichDayActivities(
      {
        morning: [
          {
            name: "An Bang Beach",
            type: "SIGHT",
            description: "Sproščen dan na plaži An Bang.",
          },
        ],
        afternoon: [],
        evening: [],
      },
      "Hoi An",
      4,
      locale,
      {
        tripDate: "2026-03-09",
        priorScheduledText: "An Bang Beach dan 8",
        plannedSights: 1,
      },
    );
    expect(day8.evening.some((a) => /an bang/i.test(a.name))).toBe(true);
    expect(day9.morning.some((a) => /an bang/i.test(a.name))).toBe(false);
    expect(day9.morning.some((a) => /klimatiziranem|ulična hrana \/ nočni trg/i.test(a.name))).toBe(false);
  });
});
