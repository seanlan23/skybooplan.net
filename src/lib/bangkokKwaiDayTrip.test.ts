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

  it("forces overwrite when title is Kwai but slots have Siam Paragon", () => {
    expect(
      shouldInjectBangkokKwaiDayTrip({
        dayInRegion: 5,
        bangkokStayDays: 5,
        dayLabelText: "Celodnevni izlet Mae Klong River Kwai",
        currentSlots: {
          morning: [{ name: "Siam Paragon", type: "SIGHT", description: "Shopping" }],
          afternoon: [
            {
              name: "Bangkok Art and Culture Centre",
              type: "SIGHT",
              description: "BACC",
            },
          ],
          evening: [],
        },
      }),
    ).toBe(true);
  });

  it("slots are exclusive 6:30–21:00 with train times and light dinner only", () => {
    const slots = buildBangkokKwaiDayTripSlots(locale);
    const blob = [...slots.morning, ...slots.afternoon, ...slots.evening]
      .map((a) => `${a.name} ${a.description}`)
      .join(" ");
    expect(blob).toMatch(/6:30/);
    expect(blob).toMatch(/08:30|8:30/);
    expect(blob).toMatch(/11:10/);
    expect(blob).toMatch(/11:38/);
    expect(blob).toMatch(/17:46/);
    expect(blob).toMatch(/Suan Sai Yok/i);
    expect(blob).toMatch(/21:00/);
    expect(blob).toMatch(/lahka večerja|light dinner/i);
    expect(blob).toMatch(/BREZ nakupovanja|no Bangkok shopping/i);
    expect(blob).not.toMatch(/Tinidee/i);
    expect(blob).toMatch(/hotela|hotel/i);
    expect(slots.evening.some((a) => a.type === "EAT")).toBe(true);
    expect(slots.morning.some((a) => /siam paragon/i.test(a.name))).toBe(false);
  });

  it("ensure overwrites polluted Kwai-labeled day", () => {
    const out = ensureBangkokKwaiDayTrip(
      {
        morning: [{ name: "Siam Paragon", type: "SIGHT", description: "Shopping" }],
        afternoon: [
          {
            name: "Bangkok Art and Culture Centre",
            type: "SIGHT",
            description: "Muzej",
          },
        ],
        evening: [{ name: "Night market", type: "ACTIVITY", description: "Izhod" }],
      },
      locale,
      {
        dayInRegion: 3,
        bangkokStayDays: 4,
        dayLabelText: "Celodnevni izlet Mae Klong → River Kwai",
      },
    );
    expect(out.morning.some((a) => /Mae Klong|Maeklong/i.test(a.name))).toBe(true);
    expect(out.morning.some((a) => /siam paragon/i.test(a.name))).toBe(false);
    expect(out.afternoon.some((a) => /art and culture|bacc/i.test(a.name))).toBe(false);
    expect(out.evening.some((a) => a.type === "EAT")).toBe(true);
  });
});
