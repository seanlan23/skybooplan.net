import { describe, expect, it } from "vitest";
import { coerceTripPlanPayload, parseCoercedTripPlan } from "@/lib/geminiPro.shared";

describe("coerceTripPlanPayload", () => {
  it("fills transport_type and duration without inventing a transfer banner", () => {
    const raw = {
      trip_metadata: {
        destination: "Thailand",
        season_warning: "October is transitional season with occasional showers.",
        currency: "EUR",
        visa_required: false,
      },
      itinerar: [
        {
          phase: "Bangkok",
          city: "Bangkok",
          unsplashQuery: "Bangkok",
          lat: 13.75,
          lng: 100.5,
          pois: [],
          days: [
            {
              day_number: 1,
              date: "2026-10-26",
              day_name: "Monday",
              title: "Arrival",
              dailyBudget: 80,
              drivingDistanceKm: 0,
              drivingDurationHours: "0h",
              activities: [
                {
                  time: "18:00",
                  title: "Prihod na letališče BKK",
                  description: "Landing and transfer.",
                  category: "airport",
                  timeSlot: "vecer",
                  arrivalTime: "17:55",
                  departureTime: "19:30",
                },
                {
                  time: "20:00",
                  title: "Grand Palace area stroll",
                  description: "Light evening walk after check-in.",
                  category: "sightseeing",
                  timeSlot: "vecer",
                  arrivalTime: "20:00",
                  departureTime: "21:30",
                  coordinates: { lat: 13.75, lng: 100.49 },
                },
              ],
            },
          ],
        },
      ],
      logistics_and_tips: {
        transport: { flights: "BKK", ferries: "n/a", city_transport: "Grab" },
        finance: "EUR/THB",
        internet: "eSIM",
      },
      hotels: [],
    };

    const parsed = parseCoercedTripPlan(coerceTripPlanPayload(raw));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const phase = parsed.data.itinerar[0]!;
    expect(phase.pois).toEqual([]);
    const airport = phase.days[0]!.activities[0]!;
    expect(airport.transport_type).toBe("flight");
    expect(airport.duration).toBeTruthy();
    expect(phase.days[0]!.transportation).toBeUndefined();
  });

  it("accepts sightseeing without arrivalTime/departureTime (flight-day strict JSON)", () => {
    const raw = {
      trip_metadata: {
        destination: "Canada",
        season_warning: "Cool evenings.",
        currency: "EUR",
        visa_required: false,
      },
      itinerar: [
        {
          phase: "Toronto",
          city: "Toronto",
          unsplashQuery: "Toronto skyline",
          lat: 43.65,
          lng: -79.38,
          pois: [],
          days: [
            {
              day_number: 1,
              date: "2026-09-12",
              day_name: "Saturday",
              title: "Arrival evening",
              dailyBudget: 90,
              drivingDistanceKm: 0,
              drivingDurationHours: "0h",
              activities: [
                {
                  time: "evening",
                  title: "Harbourfront evening stroll",
                  description: "Light walk after landing — no clocks.",
                  category: "sightseeing",
                  timeSlot: "vecer",
                  coordinates: { lat: 43.64, lng: -79.38 },
                },
              ],
            },
          ],
        },
      ],
      logistics_and_tips: {
        transport: { flights: "YYZ", ferries: "n/a", city_transport: "Uber" },
        finance: "EUR/CAD",
        internet: "eSIM",
      },
      hotels: [],
    };

    const parsed = parseCoercedTripPlan(coerceTripPlanPayload(raw));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const act = parsed.data.itinerar[0]!.days[0]!.activities[0]!;
    expect(act.title).toMatch(/Harbourfront/i);
    expect(act.arrivalTime).toBeUndefined();
    expect(act.departureTime).toBeUndefined();
  });

  it("keeps a complete description instead of clipping it into bullets", () => {
    const wall =
      "For dinner in Katoomba head to a cozy bistro near Echo Point and order seasonal Blue Mountains produce with a local wine pairing while watching the mist roll in over the Jamison Valley as the sun sets behind the Three Sisters sandstone cliffs which look spectacular at dusk especially if you walk the short path from the visitor centre first and then grab dessert at the bakery that stays open late for hikers returning from Wentworth Falls after a long day on the trails.";
    const raw = {
      trip_metadata: {
        destination: "Sydney",
        season_warning: "Cool evenings in the Blue Mountains.",
        currency: "EUR",
        visa_required: false,
      },
      itinerar: [
        {
          phase: "Blue Mountains",
          city: "Katoomba",
          unsplashQuery: "Three Sisters Katoomba",
          lat: -33.71,
          lng: 150.31,
          pois: [],
          days: [
            {
              day_number: 8,
              date: "2026-09-12",
              day_name: "Friday",
              title: "Blue Mountains",
              dailyBudget: 110,
              drivingDistanceKm: 40,
              drivingDurationHours: "1h",
              activities: [
                {
                  time: "evening",
                  title: "Dinner in Katoomba",
                  description: wall,
                  category: "food",
                  timeSlot: "vecer",
                  coordinates: { lat: -33.71, lng: 150.31 },
                },
              ],
            },
          ],
        },
      ],
      logistics_and_tips: {
        transport: { flights: "SYD", ferries: "n/a", city_transport: "train" },
        finance: "AUD",
        internet: "eSIM",
      },
      hotels: [],
    };

    const coerced = coerceTripPlanPayload(raw) as {
      itinerar: Array<{ days: Array<{ activities: Array<{ description: string; bullets?: string[] }> }> }>;
    };
    const act = coerced.itinerar[0]!.days[0]!.activities[0]!;
    expect(act.description).toBe(wall);
    expect(act.description).toContain("Wentworth Falls");

    const parsed = parseCoercedTripPlan(coerced);
    expect(parsed.success).toBe(true);
  });
});
