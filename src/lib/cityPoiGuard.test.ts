import { describe, expect, it } from "vitest";
import { stripMisplacedCityPois } from "@/lib/cityPoiGuard";
import type { DayPlan } from "@/lib/aiPlan.functions";
import { lookupPoiCoords } from "@/lib/tripGeo";

function day(partial: Partial<DayPlan> & { city: string }): DayPlan {
  return {
    day: 2,
    date: "2026-10-27",
    title: "Test",
    morning: "",
    afternoon: "",
    evening: "",
    dailyBudgetEur: 0,
    lat: 8.9,
    lng: 98.5,
    ...partial,
  };
}

describe("cityPoiGuard", () => {
  it("strips Grand Palace / Wat Pho from Khao Sok days", () => {
    const out = stripMisplacedCityPois(
      day({
        city: "Khao Sok",
        activities: {
          morning: [
            {
              name: "Grand Palace / Wat Phra Kaew",
              description: "Zapre okoli 15:30",
              type: "SIGHT",
            },
            {
              name: "Wat Pho (Ležeči Buda)",
              description: "Takoj po Grand Palace",
              type: "SIGHT",
            },
            {
              name: "Cheow Lan Lake kayak",
              description: "Jezero",
              type: "NATURE",
            },
          ],
          afternoon: [],
          evening: [],
        },
        mapPins: [
          { name: "Grand Palace", lat: 8.9, lng: 98.5, category: "sightseeing" },
          { name: "Cheow Lan Lake", lat: 8.96, lng: 98.72, category: "nature" },
        ],
      }),
    );
    expect(out.activities?.morning.map((a) => a.name)).toEqual(["Cheow Lan Lake kayak"]);
    expect(out.mapPins?.map((p) => p.name)).toEqual(["Cheow Lan Lake"]);
  });

  it("strips Bangkok Art / BTS National Stadium from Khao Sok", () => {
    const out = stripMisplacedCityPois(
      day({
        city: "Khao Sok",
        activities: {
          morning: [{ name: "Cheow Lan Lake", type: "NATURE" }],
          afternoon: [
            {
              name: "Bangkok Art and Culture Centre",
              description: "Sodobna umetnost ob BTS National Stadium",
              type: "SIGHT",
            },
          ],
          evening: [],
        },
      }),
    );
    expect(out.activities?.afternoon ?? []).toEqual([]);
    expect(out.activities?.morning.map((a) => a.name)).toEqual(["Cheow Lan Lake"]);
  });

  it("keeps Bangkok temples on Bangkok days", () => {
    const out = stripMisplacedCityPois(
      day({
        city: "Bangkok",
        activities: {
          morning: [{ name: "Grand Palace / Wat Phra Kaew", type: "SIGHT" }],
          afternoon: [],
          evening: [],
        },
      }),
    );
    expect(out.activities?.morning).toHaveLength(1);
  });
});

describe("Cheow Lan coords", () => {
  it("places lake on water, village on road 401", () => {
    const lake = lookupPoiCoords("Cheow Lan Lake kayak");
    const village = lookupPoiCoords("Khao Sok village");
    expect(lake).toBeTruthy();
    expect(village).toBeTruthy();
    // Lake further east than village
    expect(lake!.lng).toBeGreaterThan(village!.lng);
    expect(lake!.lat).toBeGreaterThan(8.9);
  });
});
