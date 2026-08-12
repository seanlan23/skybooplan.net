import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  collectRoadTripHubStops,
  enrichGroundTransportPlan,
  groundTransportPromptBlock,
  lastDayReturnPromptBlock,
} from "@/lib/groundTransport";

describe("lastDayReturnPromptBlock", () => {
  it("asks for sight-only JSON on flight last day (no airport clocks)", () => {
    const block = lastDayReturnPromptBlock({
      destinationIata: "YYZ",
      returnFromIata: "YYZ",
    });
    expect(block).toMatch(/STROGI JSON/);
    expect(block).toMatch(/BREZ HH:MM|PREPOVEDANO.*airport/i);
    expect(block).not.toMatch(/Obvezno: aktivnost category airport z natančno uro/);
  });
});

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

describe("car road trip hotels", () => {
  it("pins accommodationMode hotel and clears hotelRestEveryNDays", () => {
    const plan = {
      accommodationMode: "motorhome",
      hotelRestEveryNDays: 5,
      days: [
        { day: 1, city: "Munich", title: "Vožnja", drivingDistanceKm: 200, drivingDurationHours: "3h" },
        { day: 2, city: "Munich", title: "Ogled", drivingDistanceKm: 0 },
      ],
    } as AiTripPlan;

    enrichGroundTransportPlan(plan, {
      mode: "car",
      originPlace: "Ljubljana",
      destinationPlace: "Munich",
    });

    expect(plan.accommodationMode).toBe("hotel");
    expect(plan.hotelRestEveryNDays).toBeUndefined();
    expect(plan.groundTransportMode).toBe("car");
  });

  it("car prompt requires hotels and forbids camp lodging", () => {
    const block = groundTransportPromptBlock("car", "Ljubljana", "Barcelona");
    expect(block).toMatch(/AVTO/);
    expect(block).toMatch(/hotel/i);
    expect(block).toMatch(/PREPOVEDANO[\s\S]*kamp/i);
    expect(block).not.toMatch(/Za avtodom: kampiri/);
  });

  it("car return forbids origin-country hotels and fake short drives", () => {
    const block = groundTransportPromptBlock("car", "Maribor, SI", "Prešov, SK");
    expect(block).toMatch(/3h 15min|80 km\/h/i);
    expect(block).toMatch(/spanje doma|hotel v izhodišč/i);
    const last = lastDayReturnPromptBlock({
      groundTransportMode: "car",
      originPlace: "Maribor, SI",
    });
    expect(last).toMatch(/spanje je doma/i);
  });

  it("motorhome prompt still asks for camps", () => {
    const block = groundTransportPromptBlock("motorhome", "Ljubljana", "Barcelona");
    expect(block).toMatch(/kampiri\/RV/);
  });
});
