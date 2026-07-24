import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { collectMotorhomeMapStops } from "@/lib/motorhomeRoute";
import { buildMotorhomeStopsKml } from "@/lib/motorhomeMapExport";

describe("motorhome map export", () => {
  const plan = {
    originPlace: "Mežica",
    destinationPlace: "Split",
    destinationName: "Hrvaška road trip",
    groundTransportMode: "motorhome",
    accommodationMode: "motorhome",
    days: [
      {
        day: 1,
        city: "Plitvice",
        title: "Plitvička jezera",
        travelHack: "Parkiraj zunaj parka, v center z busom.",
        lat: 44.865,
        lng: 15.582,
        activities: {
          evening: [
            {
              name: "Camping Korana",
              type: "hotel",
              description: "RV park near lakes",
            },
          ],
        },
      },
      {
        day: 2,
        city: "Zadar",
        lat: 44.119,
        lng: 15.231,
        activities: {
          evening: [{ name: "Avtokamp Zadar", type: "hotel", description: "kamp" }],
        },
      },
    ],
  } as AiTripPlan;

  it("labels overnight stops clearly in Slovenian", () => {
    const stops = collectMotorhomeMapStops(plan, "sl");
    expect(stops[0]?.kind).toBe("start");
    expect(stops.some((s) => s.kind === "overnight" && /Nočitev/i.test(s.title))).toBe(true);
    expect(stops.some((s) => /Camping Korana/i.test(s.placeQuery))).toBe(true);
    expect(stops[stops.length - 1]?.kind).toBe("return");
  });

  it("builds KML with numbered placemarks and notes", () => {
    const stops = collectMotorhomeMapStops(plan, "sl");
    const kml = buildMotorhomeStopsKml(stops, { tripName: plan.destinationName });
    expect(kml).toContain("<kml");
    expect(kml).toContain("Camping Korana");
    expect(kml).toContain("15.582,44.865");
    expect(kml).toMatch(/Parkiraj zunaj|Nočitev/);
  });
});
