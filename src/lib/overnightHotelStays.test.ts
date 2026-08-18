import { describe, expect, it } from "vitest";
import {
  collectOvernightHotelStays,
  isoAddDays,
  overnightStayBookingUrl,
  shouldShowDayHotels,
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

  it("does not emit hotels for motorhome plans", () => {
    expect(
      collectOvernightHotelStays({
        accommodationMode: "motorhome",
        start_date: "2026-08-01",
        days: [
          { day: 1, date: "2026-08-01", city: "Venice" },
          { day: 2, date: "2026-08-02", city: "Venice" },
        ],
      }),
    ).toEqual([]);
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
    expect(stays.find((s) => /boracay/i.test(s.city))?.nights).toBe(3);
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
