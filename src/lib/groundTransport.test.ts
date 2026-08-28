import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  collectRoadTripHubStops,
  enrichGroundTransportPlan,
  groundTransportPromptBlock,
  lastDayReturnPromptBlock,
  ownVehicleRoundtripRulesPrompt,
} from "@/lib/groundTransport";

describe("lastDayReturnPromptBlock", () => {
  it("asks for sight-only JSON on flight last day (no airport clocks)", () => {
    const block = lastDayReturnPromptBlock({
      destinationIata: "YYZ",
      returnFromIata: "YYZ",
    });
    expect(block).toMatch(/STROGI JSON/);
    expect(block).toMatch(/IZBRANI LET/);
    expect(block).toMatch(/MUST ALWAYS be the departure day/);
    expect(block).toMatch(/international return flight home/);
    expect(block).toMatch(/NOČNI board|dopoldanski odhod/);
    expect(block).not.toMatch(/CESTNI KROG|1500–2200/);
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
    expect(block).toMatch(/500–700 km|1500–2200/);
    expect(block).toMatch(/logičen krog|tranzitne baze/);
    expect(block).toMatch(/≤5 h|zadnja zmerna etapa/);
  });

  it("car return forbids origin-country hotels and fake short drives", () => {
    const block = groundTransportPromptBlock("car", "Maribor, SI", "Prešov, SK");
    expect(block).toMatch(/3h 15min|80 km\/h/i);
    expect(block).toMatch(/spanje doma|hotel v izhodišč|2–3 h/i);
    const last = lastDayReturnPromptBlock({
      groundTransportMode: "car",
      originPlace: "Maribor, SI",
    });
    expect(last).toMatch(/spanje je doma/i);
    expect(last).toMatch(/day\.city MORA biti "Maribor, SI"/);
    expect(last).toMatch(/zadnja zmerna etapa|1500–2200/);
    expect(ownVehicleRoundtripRulesPrompt()).toMatch(/CESTNI KROG/);
    expect(ownVehicleRoundtripRulesPrompt()).toMatch(/1500–2200/);
  });

  it("Albania car trip gets coast/border/Plitvice/Graz rules (not only multi-country Balkan)", () => {
    const block = groundTransportPromptBlock("car", "Vienna", "Albania, AL");
    expect(block).toMatch(/Vlorë→Split|Vlore→Split|Kotor/i);
    expect(block).toMatch(/Tirana/i);
    expect(block).toMatch(/Plitvice/i);
    expect(block).toMatch(/Gradc|Graz/i);
    expect(block).toMatch(/Dhërmi|Himar/i);
    expect(block).toMatch(/Berat = nočitev|Theth|Valbona/i);
    expect(block).toMatch(/Debeli Brijeg/i);
    expect(block).toMatch(/eSIM/i);
    expect(block).toMatch(/np-plitvicka-jezera/i);
    expect(block).toMatch(/PREPOVEDANO Zagreb/i);
    expect(block).toMatch(/raziskovanje Zagreba/i);
    expect(block).toMatch(/Berat→Zagreb|Berat \/ Tirana/i);
    expect(block).toMatch(/14–16|14-16/i);
    expect(block).toMatch(/Bunk'Art/i);
  });

  it("Croatia-only car trip does not steal nights into Bosnia/Albania", () => {
    const block = groundTransportPromptBlock("car", "Vienna", "Croatia");
    expect(block).not.toMatch(/Večina NOČITEV mora biti v državah/);
    expect(block).not.toMatch(/Vlorë→Split/);
  });

  it("motorhome prompt still asks for camps", () => {
    const block = groundTransportPromptBlock("motorhome", "Ljubljana", "Barcelona");
    expect(block).toMatch(/kampiri\/RV/);
    expect(block).toMatch(/CESTNI KROG|1500–2200/);
  });
});
