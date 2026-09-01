import { describe, expect, it } from "vitest";
import {
  collectCalendarHotelStay,
  collectOvernightHotelStays,
  collectOvernightHotelStaysFromHints,
  isoAddDays,
  overnightStayBookingUrl,
  shouldShowDayHotels,
  stampOvernightCitiesFromHotels,
  holdCityHeaderUntilTransfer,
  syncDayCityToDaytimeProgram,
} from "@/lib/overnightHotelStays";

describe("collectOvernightHotelStays", () => {
  it("groups consecutive cities, skips last home day, keeps return Zagreb night", () => {
    const stays = collectOvernightHotelStays({
      originPlace: "Vienna",
      start_date: "2026-08-24",
      groundTransportMode: "car",
      days: [
        { day: 1, date: "2026-08-24", city: "Zagreb" },
        { day: 2, date: "2026-08-25", city: "Zagreb" },
        { day: 3, date: "2026-08-26", city: "Split" },
        { day: 4, date: "2026-08-27", city: "Split" },
        { day: 5, date: "2026-08-28", city: "Kotor" },
        { day: 10, date: "2026-09-02", city: "Zagreb" },
        { day: 11, date: "2026-09-03", city: "Vienna" },
      ],
    });

    expect(stays.map((s) => `${s.city}:${s.nights}:${s.checkIn}:${s.checkOut}`)).toEqual([
      "Zagreb:2:2026-08-24:2026-08-26",
      "Split:2:2026-08-26:2026-08-28",
      "Kotor:1:2026-08-28:2026-08-29",
      "Zagreb:1:2026-09-02:2026-09-03",
    ]);
  });

  it("emits camp overnight rows for motorhome plans", () => {
    expect(
      collectOvernightHotelStays({
        accommodationMode: "motorhome",
        groundTransportMode: "motorhome",
        start_date: "2026-08-01",
        days: [
          { day: 1, date: "2026-08-01", city: "Istra" },
          { day: 2, date: "2026-08-02", city: "Istra" },
          { day: 3, date: "2026-08-03", city: "Brač" },
          { day: 4, date: "2026-08-04", city: "Brač" },
          { day: 5, date: "2026-08-05", city: "Omiš" },
          { day: 6, date: "2026-08-06", city: "Omiš" },
          { day: 7, date: "2026-08-07", city: "Zagreb" },
          { day: 8, date: "2026-08-08", city: "Zagreb" },
        ],
      }),
    ).toEqual([
      {
        city: "Istra",
        checkIn: "2026-08-01",
        checkOut: "2026-08-03",
        nights: 2,
        firstDay: 1,
      },
      {
        city: "Brač",
        checkIn: "2026-08-03",
        checkOut: "2026-08-05",
        nights: 2,
        firstDay: 3,
      },
      {
        city: "Omiš",
        checkIn: "2026-08-05",
        checkOut: "2026-08-07",
        nights: 2,
        firstDay: 5,
      },
      {
        city: "Zagreb",
        checkIn: "2026-08-07",
        checkOut: "2026-08-08",
        nights: 1,
        firstDay: 7,
      },
    ]);
  });

  it("counts N-1 nights for a single-city hotel trip", () => {
    const stays = collectOvernightHotelStays({
      start_date: "2026-09-20",
      days: Array.from({ length: 7 }, (_, i) => ({
        day: i + 1,
        date: isoAddDays("2026-09-20", i),
        city: "Paris",
      })),
    });
    expect(stays).toEqual([
      {
        city: "Paris",
        checkIn: "2026-09-20",
        checkOut: "2026-09-26",
        nights: 6,
        firstDay: 1,
      },
    ]);
  });

  it("still counts a car drive-in night even if Gemini tagged it inFlightDay", () => {
    const stays = collectOvernightHotelStays({
      originPlace: "Vienna",
      start_date: "2026-08-24",
      groundTransportMode: "car",
      days: [
        { day: 1, date: "2026-08-24", city: "Zagreb", inFlightDay: true },
        { day: 2, date: "2026-08-25", city: "Zagreb" },
        { day: 3, date: "2026-08-26", city: "Split", inFlightDay: true },
        { day: 4, date: "2026-08-27", city: "Vienna" },
      ],
    });
    expect(stays.map((s) => `${s.city}:${s.nights}`)).toEqual(["Zagreb:2", "Split:1"]);
  });

  it("counts island nights even when domestic hops were tagged inFlightDay", () => {
    const stays = collectOvernightHotelStays({
      originPlace: "München",
      start_date: "2026-10-03",
      days: [
        { day: 1, date: "2026-10-03", city: "Munich", inFlightDay: true },
        { day: 2, date: "2026-10-04", city: "Manila" },
        { day: 3, date: "2026-10-05", city: "Manila", inFlightDay: true },
        { day: 4, date: "2026-10-06", city: "El Nido", inFlightDay: true },
        { day: 5, date: "2026-10-07", city: "El Nido" },
        { day: 6, date: "2026-10-08", city: "El Nido", inFlightDay: true },
        { day: 7, date: "2026-10-09", city: "Bohol", inFlightDay: true },
        { day: 8, date: "2026-10-10", city: "Bohol" },
        { day: 9, date: "2026-10-11", city: "Bohol", inFlightDay: true },
        { day: 10, date: "2026-10-12", city: "Boracay", inFlightDay: true },
        { day: 11, date: "2026-10-13", city: "Boracay" },
        { day: 12, date: "2026-10-14", city: "Boracay", inFlightDay: true },
        { day: 13, date: "2026-10-15", city: "Manila", inFlightDay: true },
        { day: 14, date: "2026-10-16", city: "Manila", inFlightDay: true },
      ],
    });
    expect(stays.map((s) => `${s.city}:${s.nights}:${s.checkIn}:${s.checkOut}`)).toEqual([
      "Manila:2:2026-10-04:2026-10-06",
      "El Nido:3:2026-10-06:2026-10-09",
      "Bohol:3:2026-10-09:2026-10-12",
      "Boracay:3:2026-10-12:2026-10-15",
      "Manila:1:2026-10-15:2026-10-16",
    ]);
  });

  it("fixes the live Manila QA JSON (3 nights El Nido, not 1)", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const p = resolve(process.cwd(), ".tmp-plan-mixed-15-2026-08-18/FL-01-Manila.json");
    if (!existsSync(p)) return;
    const plan = JSON.parse(readFileSync(p, "utf8")) as {
      originPlace?: string;
      days: Array<{ date?: string; city?: string; inFlightDay?: boolean; day?: number }>;
    };
    const stays = collectOvernightHotelStays({
      originPlace: plan.originPlace ?? "München",
      start_date: plan.days[0]?.date,
      days: plan.days,
    });
    expect(stays.find((s) => /el nido/i.test(s.city))?.nights).toBe(3);
    expect(stays.find((s) => /bohol/i.test(s.city))?.nights).toBe(3);
    expect(stays.find((s) => /boracay/i.test(s.city))?.nights).toBeGreaterThanOrEqual(2);
  });

  it("stamps day.city to the sleep city on a late hop and splits NAMESTITVE by sleep nights", () => {
    const days = [
      {
        day: 1,
        date: "2026-10-26",
        city: "Bangkok",
        activities: {
          morning: [],
          afternoon: [{ name: "Arrival" }],
          evening: [{ name: "Yaowarat" }],
        },
      },
      {
        day: 2,
        date: "2026-10-27",
        city: "Bangkok",
        activities: {
          morning: [{ name: "Grand Palace" }],
          afternoon: [{ name: "Wat Arun" }],
          evening: [{ name: "Dinner" }],
        },
      },
      {
        day: 3,
        date: "2026-10-28",
        city: "Bangkok",
        transportation: [{ type: "flight", from: "Bangkok", to: "Chiang Mai" }],
        activities: {
          morning: [{ name: "Wat Pho" }],
          afternoon: [{ name: "Chinatown" }],
          evening: [{ name: "Flight to Chiang Mai", type: "TRANSPORT" }],
        },
      },
      { day: 4, date: "2026-10-29", city: "Chiang Mai" },
      { day: 5, date: "2026-10-30", city: "Chiang Mai" },
      { day: 6, date: "2026-10-31", city: "Chiang Mai" },
    ];
    expect(syncDayCityToDaytimeProgram(days)).toBeGreaterThan(0);
    expect(days[2]!.city).toBe("Chiang Mai");
    const stays = collectOvernightHotelStays({
      originPlace: "München",
      start_date: "2026-10-26",
      days,
    });
    expect(stays.map((s) => `${s.city}:${s.nights}:${s.checkIn}:${s.checkOut}`)).toEqual([
      "Bangkok:2:2026-10-26:2026-10-28",
      "Chiang Mai:3:2026-10-28:2026-10-31",
    ]);
  });

  it("moves day.city to the new base on a morning train hop and splits NAMESTITVE by sleep", () => {
    const days = [
      { day: 1, date: "2026-09-20", city: "Osaka" },
      { day: 2, date: "2026-09-21", city: "Osaka" },
      {
        day: 3,
        date: "2026-09-22",
        city: "Osaka",
        title: "Osaka",
        transportation: [{ type: "train", from: "Osaka", to: "Tokyo" }],
        activities: {
          morning: [{ name: "Shinkansen iz Osake v Tokio", type: "TRANSPORT" }],
          afternoon: [{ name: "Shinjuku" }],
          evening: [{ name: "Ginza" }],
        },
      },
      {
        day: 4,
        date: "2026-09-23",
        city: "Osaka",
        activities: { morning: [{ name: "Ghibli Museum" }], afternoon: [], evening: [] },
      },
      { day: 5, date: "2026-09-24", city: "Osaka" },
      { day: 6, date: "2026-09-25", city: "Osaka" },
      { day: 7, date: "2026-09-26", city: "Osaka" },
      { day: 8, date: "2026-09-27", city: "Osaka" },
    ];
    expect(syncDayCityToDaytimeProgram(days)).toBeGreaterThan(0);
    expect(days.slice(2, 8).map((d) => d.city)).toEqual([
      "Tokyo",
      "Tokyo",
      "Tokyo",
      "Tokyo",
      "Tokyo",
      "Tokyo",
    ]);
    expect(days[2]!.title).toBe("Tokyo");
    const stays = collectOvernightHotelStays({
      originPlace: "München",
      start_date: "2026-09-20",
      days,
    });
    expect(stays.map((s) => `${s.city}:${s.nights}:${s.checkIn}:${s.checkOut}`)).toEqual([
      "Osaka:2:2026-09-20:2026-09-22",
      "Tokyo:5:2026-09-22:2026-09-27",
    ]);
  });

  it("keeps El Nido as sleep city when the hop to-code is ENI", () => {
    const days = [
      { day: 1, date: "2026-10-04", city: "Manila" },
      {
        day: 2,
        date: "2026-10-05",
        city: "El Nido",
        transportation: [{ type: "flight", from: "MNL", to: "ENI" }],
        activities: {
          morning: [{ name: "Notranji let MNL → El Nido", type: "TRANSPORT" }],
          afternoon: [{ name: "Nacpan Beach" }],
          evening: [{ name: "Dinner" }],
        },
      },
      { day: 3, date: "2026-10-06", city: "El Nido" },
      { day: 4, date: "2026-10-07", city: "El Nido" },
    ];
    syncDayCityToDaytimeProgram(days);
    expect(days[1]!.city).toBe("El Nido");
    expect(days[2]!.city).toBe("El Nido");
  });
});

describe("shouldShowDayHotels", () => {
  it("shows Booking on the first night of a car city even when inFlightDay was set", () => {
    expect(
      shouldShowDayHotels({
        city: "Zagreb",
        isFirstInCity: true,
        inFlightDay: true,
        groundTransportMode: "car",
        accommodationMode: "hotel",
        dayNumber: 1,
        totalTripDays: 11,
      }),
    ).toBe(true);
  });

  it("hides hotels on the last calendar day and on true flight days", () => {
    expect(
      shouldShowDayHotels({
        city: "Zagreb",
        isFirstInCity: true,
        groundTransportMode: "car",
        dayNumber: 11,
        totalTripDays: 11,
      }),
    ).toBe(false);
    expect(
      shouldShowDayHotels({
        city: "Bangkok",
        isFirstInCity: true,
        inFlightDay: true,
        dayNumber: 1,
        totalTripDays: 12,
      }),
    ).toBe(false);
    expect(
      shouldShowDayHotels({
        city: "El Nido",
        isFirstInCity: true,
        inFlightDay: true,
        dayNumber: 4,
        totalTripDays: 14,
      }),
    ).toBe(true);
  });
});

describe("overnightStayBookingUrl", () => {
  it("builds an absolute Skybooplan Booking hop with city and dates", () => {
    const href = overnightStayBookingUrl(
      {
        city: "Split",
        checkIn: "2026-08-26",
        checkOut: "2026-08-28",
        nights: 2,
        firstDay: 3,
      },
      { adults: 2, lang: "sl" },
    );
    expect(href.startsWith("https://www.skybooplan.com/api/go/booking?")).toBe(true);
    const dest = new URL(href).searchParams.get("u") ?? "";
    const booking = new URL(dest);
    expect(booking.hostname).toBe("www.booking.com");
    expect(booking.searchParams.get("ss")).toBe("Split");
    expect(booking.searchParams.get("checkin")).toBe("2026-08-26");
    expect(booking.searchParams.get("checkout")).toBe("2026-08-28");
    expect(booking.searchParams.get("group_adults")).toBe("2");
  });
});

describe("stampOvernightCitiesFromHotels", () => {
  it("rewrites a collapsed gateway city from hotels[] night counts", () => {
    const days = Array.from({ length: 8 }, (_, i) => ({
      day: i + 1,
      date: isoAddDays("2026-07-24", i),
      city: "Denpasar",
    }));
    const stamped = stampOvernightCitiesFromHotels(days, [
      { city: "Seminyak", nights: 3 },
      { city: "Ubud", nights: 2 },
      { city: "Nusa Lembongan", nights: 2 },
    ]);
    expect(stamped).toBe(true);
    expect(days.slice(0, 7).map((d) => d.city)).toEqual([
      "Seminyak",
      "Seminyak",
      "Seminyak",
      "Ubud",
      "Ubud",
      "Nusa Lembongan",
      "Nusa Lembongan",
    ]);
    expect(days[7]?.city).toBe("Denpasar");
  });

  it("does not rewrite when overnight days already span multiple cities", () => {
    const days = [
      { day: 1, date: "2026-07-24", city: "Ubud" },
      { day: 2, date: "2026-07-25", city: "Ubud" },
      { day: 3, date: "2026-07-26", city: "Amed" },
      { day: 4, date: "2026-07-27", city: "Amed" },
    ];
    expect(
      stampOvernightCitiesFromHotels(days, [
        { city: "Seminyak", nights: 2 },
        { city: "Ubud", nights: 1 },
      ]),
    ).toBe(false);
    expect(days.map((d) => d.city)).toEqual(["Ubud", "Ubud", "Amed", "Amed"]);
  });
});

describe("collectCalendarHotelStay", () => {
  it("spans the full flight stay, not a short Gemini hotel window", () => {
    const stays = collectCalendarHotelStay({
      city: "Cancún Riviera Maya",
      startDate: "2026-10-01",
      endDate: "2026-10-08",
      hotel: { city: "Cancún", nights: 3, from_date: "2026-10-01", to_date: "2026-10-04" },
    });
    expect(stays).toEqual([
      {
        city: "Cancún",
        checkIn: "2026-10-01",
        checkOut: "2026-10-08",
        nights: 7,
        firstDay: 1,
      },
    ]);
  });
});

describe("collectOvernightHotelStaysFromHints", () => {
  it("chains stay rows from hotels[] when days collapsed", () => {
    const stays = collectOvernightHotelStaysFromHints(
      [
        { city: "Seminyak", nights: 3 },
        { city: "Ubud", nights: 2 },
        { city: "Nusa Lembongan", nights: 2 },
      ],
      "2026-07-24",
    );
    expect(stays.map((s) => `${s.city}:${s.nights}:${s.checkIn}:${s.checkOut}`)).toEqual([
      "Seminyak:3:2026-07-24:2026-07-27",
      "Ubud:2:2026-07-27:2026-07-29",
      "Nusa Lembongan:2:2026-07-29:2026-07-31",
    ]);
  });
});

describe("holdCityHeaderUntilTransfer", () => {
  it("keeps the current city until the calendar day the hop happens", () => {
    const days = [
      { day: 1, date: "2026-09-19", city: "New York" },
      { day: 2, date: "2026-09-20", city: "Boston" },
      {
        day: 3,
        date: "2026-09-21",
        city: "Boston",
        transportation: [{ type: "train", from: "New York", to: "Boston" }],
      },
      { day: 4, date: "2026-09-22", city: "Boston" },
    ];
    expect(holdCityHeaderUntilTransfer(days)).toBe(1);
    expect(days.map((d) => d.city)).toEqual(["New York", "New York", "Boston", "Boston"]);
  });

  it("does not pull an arrival city back onto the origin hub day", () => {
    const days = [
      { day: 1, date: "2026-09-19", city: "Munich", inFlightDay: true },
      { day: 2, date: "2026-09-20", city: "New York" },
      { day: 3, date: "2026-09-21", city: "New York" },
    ];
    expect(holdCityHeaderUntilTransfer(days)).toBe(0);
    expect(days.map((d) => d.city)).toEqual(["Munich", "New York", "New York"]);
  });
});

describe("island boat overnight hop", () => {
  it("stamps day.city onto the island until the return, and splits NAMESTITVE nights", () => {
    const days = [
      { day: 12, date: "2026-11-06", city: "Ubud", title: "Ubud" },
      {
        day: 13,
        date: "2026-11-07",
        city: "Ubud",
        title: "Ubud",
        activities: {
          morning: [
            {
              name: "Padang Bai → Gili Trawangan",
              type: "TRANSPORT",
              description: "Speedboat z ladjo na Gili Trawangan.",
            },
          ],
          afternoon: [{ name: "Snorkljanje s želvami na Gili Trawangan" }],
          evening: [],
        },
      },
      {
        day: 14,
        date: "2026-11-08",
        city: "Ubud",
        title: "Ubud",
        activities: {
          morning: [{ name: "Kolesarjenje okoli Gili Trawangan" }],
          afternoon: [{ name: "Sunset na zahodni obali" }],
          evening: [],
        },
      },
      {
        day: 15,
        date: "2026-11-09",
        city: "Ubud",
        title: "Ubud",
        activities: {
          morning: [{ name: "Čoln med Gili otoki" }],
          afternoon: [{ name: "Plaža na Gili Trawangan" }],
          evening: [],
        },
      },
      {
        day: 16,
        date: "2026-11-10",
        city: "Ubud",
        title: "Ubud",
        activities: {
          morning: [
            {
              name: "Gili Trawangan → Padang Bai",
              type: "TRANSPORT",
              description: "Trajekt nazaj v Ubud.",
            },
          ],
          afternoon: [{ name: "Tegalalang in riževe terase v Ubudu" }],
          evening: [],
        },
      },
      {
        day: 17,
        date: "2026-11-11",
        city: "Ubud",
        title: "Ubud",
        activities: {
          morning: [{ name: "Sacred Monkey Forest v Ubudu" }],
          afternoon: [],
          evening: [],
        },
      },
      { day: 18, date: "2026-11-12", city: "Ubud", title: "Ubud" },
    ];
    expect(syncDayCityToDaytimeProgram(days)).toBeGreaterThan(0);
    expect(days[1]!.city).toMatch(/Gili/i);
    expect(days[2]!.city).toMatch(/Gili/i);
    expect(days[3]!.city).toMatch(/Gili/i);
    expect(days[4]!.city).toMatch(/Ubud/i);
    expect(days[5]!.city).toMatch(/Ubud/i);
    const stays = collectOvernightHotelStays({
      originPlace: "München",
      start_date: "2026-10-26",
      days,
    });
    const gili = stays.find((s) => /gili/i.test(s.city));
    const ubudAfter = [...stays].reverse().find((s) => /ubud/i.test(s.city));
    expect(gili).toMatchObject({ nights: 3, checkIn: "2026-11-07", checkOut: "2026-11-10" });
    expect(ubudAfter).toMatchObject({ nights: 2, checkIn: "2026-11-10", checkOut: "2026-11-12" });
  });
});
