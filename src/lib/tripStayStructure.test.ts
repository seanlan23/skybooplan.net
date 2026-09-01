import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan } from "@/lib/aiPlan.functions";
import { uniquifyDayActivityClocks } from "@/lib/activityTime";
import { sortDepartureDayChronology, stripPrematureDepartureLogistics } from "@/lib/departureDaySort";
import { alignDayCityToActivities } from "@/lib/itineraryCityAlign";
import { isEnricherPlaceholderActivity } from "@/lib/itineraryGuards";
import { enforceTripBaseCap, tripStayBaseCap } from "@/lib/tripBaseCap";
import { stabilizeTripStayStructure } from "@/lib/tripStayStructure";

function isoAdd(start: string, days: number): string {
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function day(
  n: number,
  city: string,
  extra?: Partial<DayPlan>,
): DayPlan {
  return {
    day: n,
    date: isoAdd("2026-10-26", n - 1),
    title: city,
    city,
    focusName: city,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 50,
    lat: extra?.lat ?? 0,
    lng: extra?.lng ?? 0,
    category: "city",
    activities: extra?.activities ?? { morning: [], afternoon: [], evening: [] },
    ...extra,
  };
}

function planOf(days: DayPlan[], extra?: Partial<AiTripPlan>): AiTripPlan {
  return {
    destinationName: "Bali",
    summary: "test",
    contentLanguage: "sl",
    totalBudgetEur: 0,
    centerLat: -8.5,
    centerLng: 115.2,
    originIata: "MUC",
    destinationIata: "DPS",
    originPlace: "München",
    tripStyle: "explorer",
    days,
    ...extra,
  };
}

const BASES: Array<{ city: string; lat: number; lng: number }> = [
  { city: "Denpasar", lat: -8.67, lng: 115.21 },
  { city: "Ubud", lat: -8.51, lng: 115.26 },
  { city: "Sidemen", lat: -8.48, lng: 115.44 },
  { city: "Nusa Lembongan", lat: -8.67, lng: 115.45 },
  { city: "Seminyak", lat: -8.69, lng: 115.16 },
  { city: "Nusa Dua", lat: -8.8, lng: 115.23 },
  { city: "Amed", lat: -8.33, lng: 115.63 },
  { city: "Kuta", lat: -8.72, lng: 115.17 },
];

function eightHotelSeventeenDayPlan(): AiTripPlan {
  const days: DayPlan[] = [];
  let n = 1;
  for (let b = 0; b < 7; b++) {
    const base = BASES[b]!;
    for (let k = 0; k < 2; k++) {
      days.push(
        day(n, base.city, {
          lat: base.lat,
          lng: base.lng,
          activities: {
            morning: [
              {
                name: b === 6 ? "Tirta Gangga" : `Ogled v ${base.city}`,
                description:
                  b === 0
                    ? "Bajra Sandhi in trg Puputan v Denpasarju."
                    : "Ogled in enodnevni izlet, ne menjava hotela.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        }),
      );
      n += 1;
    }
  }
  const kuta = BASES[7]!;
  days.push(
    day(15, kuta.city, { lat: kuta.lat, lng: kuta.lng }),
    day(16, kuta.city, { lat: kuta.lat, lng: kuta.lng }),
    day(17, "München", {
      lat: kuta.lat,
      lng: kuta.lng,
      activities: {
        morning: [
          {
            name: "Pristanek na letališču MUC",
            type: "TRANSPORT",
            description: "Pristanek ob 06:00.",
            arrivalTime: "06:00",
          },
        ],
        afternoon: [
          {
            name: "Odjava iz hotela",
            type: "STAY",
            description: "Check-out in transfer.",
            arrivalTime: "15:45",
          },
          {
            name: "Prevoz na letališče",
            type: "TRANSPORT",
            description: "Transfer na DPS.",
            arrivalTime: "15:45",
          },
        ],
        evening: [
          {
            name: "Odhod mednarodnega leta DPS → MUC",
            type: "TRANSPORT",
            description: "Polet ob 18:45.",
            arrivalTime: "18:45",
          },
        ],
      },
    }),
  );
  return planOf(days, {
    hotels: BASES.map((b) => ({ city: b.city, nights: 2 })),
    flightContext: {
      outboundDepart: "10:00",
      outboundArrive: "22:00",
      inboundDepart: "18:45",
      inboundArrive: "06:00",
    },
  });
}

describe("tripStayBaseCap", () => {
  it("gives 14–17 day trips at most 4 bases of 3–5 nights", () => {
    expect(tripStayBaseCap(9).maxBases).toBe(2);
    expect(tripStayBaseCap(13).maxBases).toBe(3);
    expect(tripStayBaseCap(14)).toMatchObject({ maxBases: 4, minNights: 3, maxNights: 5 });
    expect(tripStayBaseCap(17)).toMatchObject({ maxBases: 4, minNights: 3, maxNights: 5, minBases: 3 });
  });
});

describe("enforceTripBaseCap", () => {
  it("collapses 8×2-night hops on a 17-day trip into 3–4 bases", () => {
    const plan = eightHotelSeventeenDayPlan();
    enforceTripBaseCap(plan);
    const hotels = plan.hotels ?? [];
    expect(hotels.length).toBeGreaterThanOrEqual(3);
    expect(hotels.length).toBeLessThanOrEqual(6);
    expect(hotels.some((h) => /amed/i.test(h.city))).toBe(false);
    for (const h of hotels) {
      expect(h.nights ?? 0).toBeGreaterThanOrEqual(3);
      expect(h.nights ?? 0).toBeLessThanOrEqual(5);
    }
    const amedDays = plan.days.filter((d) =>
      (d.activities?.morning ?? []).some((a) => /Tirta Gangga/i.test(a.name)),
    );
    expect(amedDays.length).toBeGreaterThan(0);
    expect(amedDays.every((d) => !/amed/i.test(d.city))).toBe(true);
  });

  it("does not merge an explicit stay plan", () => {
    const plan = eightHotelSeventeenDayPlan();
    plan.wishes = "4 noči Ubud, 3 noči Seminyak, 2 noči Kuta, 2 noči Nusa Dua";
    const before = (plan.hotels ?? []).map((h) => h.city).join("|");
    expect(enforceTripBaseCap(plan)).toBe(0);
    expect((plan.hotels ?? []).map((h) => h.city).join("|")).toBe(before);
  });
});

describe("sortDepartureDayChronology", () => {
  it("puts 06:00 home landing after the 18:45 flight, not in the morning", () => {
    const plan = eightHotelSeventeenDayPlan();
    sortDepartureDayChronology(plan, {
      inboundDepart: "18:45",
      inboundArrive: "06:00",
      language: "sl",
      originIata: "MUC",
    });
    const last = plan.days[plan.days.length - 1]!;
    expect(last.city).toMatch(/Kuta/i);
    const morning = JSON.stringify(last.activities?.morning ?? []);
    const afternoon = JSON.stringify(last.activities?.afternoon ?? []);
    const evening = JSON.stringify(last.activities?.evening ?? []);
    expect(morning).not.toMatch(/pristanek|06:00/i);
    expect(afternoon).toMatch(/odjava|prevoz na letališč/i);
    expect(evening).toMatch(/mednarodn/i);
    expect(evening).toMatch(/naslednji dan/i);
    expect(evening).toMatch(/pristanek/i);

    const pdfOrder = uniquifyDayActivityClocks(last.activities ?? {});
    const pdfMorning = JSON.stringify(pdfOrder.morning);
    expect(pdfMorning).not.toMatch(/pristanek/i);
    const pdfEvening = JSON.stringify(pdfOrder.evening);
    const flightIdx = pdfEvening.toLowerCase().indexOf("mednarodn");
    const landIdx = pdfEvening.toLowerCase().indexOf("pristanek");
    expect(flightIdx).toBeGreaterThanOrEqual(0);
    expect(landIdx).toBeGreaterThan(flightIdx);
  });
});

describe("alignDayCityToActivities", () => {
  it("relabels an Ubud header when the day is exploring Denpasar", () => {
    const plan = planOf([
      day(1, "Ubud", {
        lat: -8.51,
        lng: 115.26,
        title: "Raziskovanje Denpasarja",
        activities: {
          morning: [
            {
              name: "Bajra Sandhi v Denpasarju",
              description: "Spomenik in trg Puputan v Denpasarju.",
            },
          ],
          afternoon: [{ name: "Tržnica Badung v Denpasarju", description: "Lokalna tržnica." }],
          evening: [],
        },
      }),
      day(2, "Ubud", { lat: -8.51, lng: 115.26 }),
    ]);
    expect(alignDayCityToActivities(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.city).toMatch(/Denpasar/i);
  });
});

describe("stripPrematureDepartureLogistics", () => {
  it("keeps checkout on the 21:10 flight day and clears it from the previous evening", () => {
    const plan = planOf([
      day(18, "Kuta", {
        lat: -8.72,
        lng: 115.17,
        activities: {
          morning: [{ name: "Zadnji sprehod po plaži", description: "Kuta Beach." }],
          afternoon: [],
          evening: [
            {
              name: "Odjava iz hotela",
              type: "STAY",
              description: "Večerna odjava pred letom.",
              arrivalTime: "22:30",
            },
            {
              name: "Prevoz na letališče",
              type: "TRANSPORT",
              description: "Transfer na DPS.",
              arrivalTime: "23:00",
            },
          ],
        },
      }),
      day(19, "Kuta", {
        lat: -8.72,
        lng: 115.17,
        activities: {
          morning: [],
          afternoon: [
            {
              name: "Odjava iz hotela",
              type: "STAY",
              description: "Odjava ob 18:00.",
              arrivalTime: "18:00",
            },
            {
              name: "Prevoz na letališče",
              type: "TRANSPORT",
              description: "Na DPS 3 ure pred poletom.",
              arrivalTime: "18:10",
            },
          ],
          evening: [
            {
              name: "Odhod mednarodnega leta DPS → MUC",
              type: "TRANSPORT",
              arrivalTime: "21:10",
            },
          ],
        },
      }),
    ]);
    stripPrematureDepartureLogistics(plan, { inboundDepart: "21:10" });
    expect(JSON.stringify(plan.days[0]!.activities)).not.toMatch(/odjava|prevoz na letališč/i);
    expect(JSON.stringify(plan.days[1]!.activities)).toMatch(/odjava/i);
    expect(JSON.stringify(plan.days[1]!.activities)).toMatch(/21:10/);
  });
});

describe("generic town-sights template", () => {
  it("flags the leftover meta description as a placeholder", () => {
    expect(
      isEnricherPlaceholderActivity({
        name: "Lokalni ogled Ubud",
        description: "Ubud: lokalne znamenitosti, staro mestno jedro in bližnje plaže.",
      }),
    ).toBe(true);
  });
});

describe("stabilizeTripStayStructure", () => {
  it("caps bases and sorts the departure day together", () => {
    const plan = eightHotelSeventeenDayPlan();
    stabilizeTripStayStructure(plan, {
      inboundDepart: "18:45",
      inboundArrive: "06:00",
      language: "sl",
      originIata: "MUC",
      calendarDays: 17,
    });
    expect(plan.hotels?.length ?? 99).toBeLessThanOrEqual(6);
    expect(plan.days[0]!.city).toMatch(/Denpasar/i);
    expect(plan.days[1]!.city).toMatch(/Denpasar/i);
    const last = plan.days[16]!;
    expect(JSON.stringify(last.activities?.morning ?? [])).not.toMatch(/pristanek/i);
    expect(JSON.stringify(last.activities?.evening ?? [])).toMatch(/naslednji dan/i);
  });
});
