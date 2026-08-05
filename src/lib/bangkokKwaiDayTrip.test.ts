import { describe, expect, it } from "vitest";
import {
  BANGKOK_KWAI_DAY_TRIP_STOPS,
  applyBangkokKwaiDayTripToPlan,
  bangkokKwaiDayTripMapsNote,
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
    expect(url).toMatch(/Your%20hotel|Your hotel/i);
    expect(url).toMatch(/Rom%20Hup|Maeklong/i);
    expect(url).toMatch(/Tham%20Krasae|Death%20Railway/i);
    expect(url).not.toMatch(/Tinidee/i);
    expect(BANGKOK_KWAI_DAY_TRIP_STOPS[0]).toMatch(/Your hotel/i);
    expect(BANGKOK_KWAI_DAY_TRIP_STOPS.at(-1)).toMatch(/Your hotel/i);
  });

  it("maps note tells users to replace start/end with their lodging", () => {
    const note = bangkokKwaiDayTripMapsNote(true);
    expect(note).toContain("google.com/maps/dir/");
    expect(note).toMatch(/zamenjaj s svojo namestitvijo/i);
    expect(note).not.toMatch(/Tinidee/i);
    const slots = buildBangkokKwaiDayTripSlots(locale);
    expect(slots.morning[0]?.description).toContain("google.com/maps/dir/");
    expect(slots.morning[0]?.description).toMatch(/svojo namestitvijo/i);
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

  it("skips arrival; Mae Klong alone does not block inject", () => {
    expect(
      shouldInjectBangkokKwaiDayTrip({
        dayInRegion: 3,
        bangkokStayDays: 4,
        isArrivalDay: true,
      }),
    ).toBe(false);
    // Need Mae Klong + west Kwai cues before we treat the trip as already covered.
    expect(
      shouldInjectBangkokKwaiDayTrip({
        dayInRegion: 3,
        bangkokStayDays: 4,
        priorScheduledText: "Mae Klong Railway Market včeraj",
      }),
    ).toBe(true);
    expect(
      shouldInjectBangkokKwaiDayTrip({
        dayInRegion: 3,
        bangkokStayDays: 4,
        priorScheduledText:
          "Mae Klong Railway Market + River Kwai Bridge + Tham Krasae Death Railway",
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

  it("applyBangkokKwaiDayTripToPlan fixes Gemini Kwai day with Sai Yok in Bangkok + drive card", () => {
    const out = applyBangkokKwaiDayTripToPlan(
      [
        {
          day: 4,
          city: "Bangkok",
          title: "Dan 4: Celodnevni izlet: Tržnice, most na reki Kwai in Železnica smrti",
          focusName: "River Kwai",
          activities: {
            morning: [
              {
                name: "Mae Klong Railway Market",
                type: "ACTIVITY",
                description: "Tržnica",
                lat: 13.75,
                lng: 100.5,
              },
            ],
            afternoon: [
              {
                name: "Most na reki Kwai",
                type: "SIGHT",
                description: "Ogled",
                lat: 13.76,
                lng: 100.5,
              },
            ],
            evening: [
              {
                name: "Postanek pri slapovih Sai Yok Noi",
                type: "NATURE",
                description: "Osvežitev pred vračilom",
                lat: 13.7563,
                lng: 100.5018,
              },
            ],
          },
          transportation: [
            { type: "car", duration: "14 ur", cost: "", description: "300 km" },
          ],
          drivingDistanceKm: 300,
          drivingDurationHours: "14",
        },
        {
          day: 5,
          city: "Bangkok",
          title: "Templji",
          activities: {
            morning: [{ name: "Wat Pho", type: "SIGHT", description: "Tempelj" }],
            afternoon: [],
            evening: [],
          },
        },
      ],
      locale,
    );

    const day4 = out[0]!;
    expect(day4.title).toMatch(/Mae Klong|Death Railway/i);
    expect(day4.transportation).toBeUndefined();
    expect(day4.drivingDistanceKm).toBeUndefined();
    expect(day4.activities?.evening.some((a) => /Sai Yok Noi/i.test(a.name))).toBe(
      false,
    );
    expect(
      day4.activities?.evening.some((a) => /Tham Krasae|Suan Sai Yok/i.test(a.name)),
    ).toBe(true);
    const sai = day4.activities?.evening.find((a) => /Tham Krasae|Suan Sai Yok/i.test(a.name));
    expect(sai?.lng).toBeLessThan(100);
    expect(out[1]?.activities?.morning[0]?.name).toMatch(/Wat Pho/i);
  });
});
