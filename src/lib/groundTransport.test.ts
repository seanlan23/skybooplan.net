import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { collectRoadTripHubStops, enrichGroundTransportPlan } from "@/lib/groundTransport";

describe("collectRoadTripHubStops", () => {
  it("collapses multi-night stays into one chip per city", () => {
    const plan = {
      groundTransportMode: "motorhome",
      days: [
        { day: 1, city: "San Daniele del Friuli", title: "A" },
        { day: 2, city: "Venice", title: "B" },
        { day: 3, city: "Venice", title: "C" },
        { day: 4, city: "Lazise", title: "D" },
        { day: 5, city: "Lazise", title: "E" },
        { day: 6, city: "Florence", title: "F" },
        { day: 7, city: "Florence", title: "G" },
        { day: 8, city: "Florence", title: "H" },
        { day: 9, city: "Rome", title: "I" },
      ],
    } as AiTripPlan;

    const stops = collectRoadTripHubStops(plan);
    expect(stops.map((s) => s.name)).toEqual([
      "San Daniele del Friuli",
      "Venice",
      "Lazise",
      "Florence",
      "Rome",
    ]);
    expect(stops.find((s) => s.name === "Venice")?.day).toBe(2);
    expect(stops.find((s) => s.name === "Florence")?.day).toBe(6);
  });
});

describe("enrichGroundTransportPlan motorhome", () => {
  it("stores hub stops not one-per-day", () => {
    const plan = {
      days: [
        { day: 1, city: "Venice", title: "Vožnja", drivingDistanceKm: 120, drivingDurationHours: "2h" },
        { day: 2, city: "Venice", title: "Magija", drivingDistanceKm: 0 },
        { day: 3, city: "Rome", title: "Vožnja v Rim", drivingDistanceKm: 400, drivingDurationHours: "5h" },
        { day: 4, city: "Rome", title: "Ogled", drivingDistanceKm: 0 },
      ],
    } as AiTripPlan;

    enrichGroundTransportPlan(plan, {
      mode: "motorhome",
      originPlace: "Mežica",
      destinationPlace: "Italy",
    });

    expect(plan.groundJourney?.stops.map((s) => s.name)).toEqual(["Venice", "Rome"]);
    expect(plan.groundJourney?.totalDistanceKm).toBe(520);
  });
});
