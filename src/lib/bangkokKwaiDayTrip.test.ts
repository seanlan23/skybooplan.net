import { describe, expect, it } from "vitest";
import {
  BANGKOK_KWAI_DAY_TRIP_STOPS,
  buildBangkokKwaiDayTripMapsUrl,
  buildBangkokKwaiDayTripSlots,
  ensureBangkokKwaiDayTrip,
  shouldInjectBangkokKwaiDayTrip,
} from "@/lib/bangkokKwaiDayTrip";
import { resolveTripLocale } from "@/lib/tripLocale";

const locale = resolveTripLocale("BKK", "Tajska", "sl");

describe("bangkokKwaiDayTrip", () => {
  it("builds Maps URL with generic hotel, never Tinidee", () => {
    const url = buildBangkokKwaiDayTripMapsUrl();
    expect(url).toContain("google.com/maps/dir/");
    expect(url).toMatch(/Your%20hotel%2C%20Bangkok|Your hotel/i);
    expect(url).not.toMatch(/Tinidee/i);
    expect(BANGKOK_KWAI_DAY_TRIP_STOPS[0]).toBe("Your hotel, Bangkok");
    expect(BANGKOK_KWAI_DAY_TRIP_STOPS.at(-1)).toBe("Your hotel, Bangkok");
  });

  it("injects on Bangkok day 3 when stay ≥ 3", () => {
    expect(
      shouldInjectBangkokKwaiDayTrip({
        dayInRegion: 3,
        bangkokStayDays: 3,
        isArrivalDay: false,
      }),
    ).toBe(true);
    expect(
      shouldInjectBangkokKwaiDayTrip({
        dayInRegion: 2,
        bangkokStayDays: 3,
        isArrivalDay: false,
      }),
    ).toBe(false);
  });

  it("injects on day 2 for short Bangkok stays", () => {
    expect(
      shouldInjectBangkokKwaiDayTrip({
        dayInRegion: 2,
        bangkokStayDays: 2,
        isArrivalDay: false,
      }),
    ).toBe(true);
  });

  it("skips arrival and when trip already has Mae Klong", () => {
    expect(
      shouldInjectBangkokKwaiDayTrip({
        dayInRegion: 3,
        bangkokStayDays: 4,
        isArrivalDay: true,
      }),
    ).toBe(false);
    expect(
      shouldInjectBangkokKwaiDayTrip({
        dayInRegion: 3,
        bangkokStayDays: 4,
        priorScheduledText: "Mae Klong Railway Market včeraj",
      }),
    ).toBe(false);
  });

  it("slots stress 6:30 start and driver navigation tip", () => {
    const slots = buildBangkokKwaiDayTripSlots(locale);
    const blob = [...slots.morning, ...slots.afternoon, ...slots.evening]
      .map((a) => `${a.name} ${a.description}`)
      .join(" ");
    expect(blob).toMatch(/6:30/);
    expect(blob).toMatch(/8:30/);
    expect(blob).toMatch(/navigacij/i);
    expect(blob).toMatch(/Suan Sai Yok/i);
    expect(blob).not.toMatch(/Tinidee/i);
    expect(blob).toMatch(/hotela|hotel/i);
  });

  it("ensure overwrites the day when due", () => {
    const out = ensureBangkokKwaiDayTrip(
      {
        morning: [{ name: "Grand Palace", type: "SIGHT", description: "Tempelj" }],
        afternoon: [],
        evening: [],
      },
      locale,
      { dayInRegion: 3, bangkokStayDays: 4 },
    );
    expect(out.morning.some((a) => /Mae Klong|Maeklong/i.test(a.name))).toBe(true);
    expect(out.morning.some((a) => /grand palace/i.test(a.name))).toBe(false);
  });
});
