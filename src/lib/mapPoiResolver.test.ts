import { describe, expect, it } from "vitest";
import type { Activity, DayPlan } from "@/lib/aiPlan.functions";
import { resolveActivityCoordinates, resolveActivityMapCategory } from "@/lib/mapPoiResolver";

describe("mapPoiResolver", () => {
  const bangkokDay: DayPlan = {
    day: 2,
    date: "2026-07-27",
    title: "Bangkok",
    morning: "",
    afternoon: "",
    evening: "",
    city: "Bangkok",
    lat: 13.756,
    lng: 100.502,
  };

  it("resolves Grand Palace to curated coords", () => {
    const act: Activity = {
      name: "Obisk veličastne kraljeve palače Grand Palace",
      description: "Tempelj Wat Phra Kaew",
    };
    const coords = resolveActivityCoordinates(act, bangkokDay);
    expect(coords).not.toBeNull();
    expect(coords!.lat).toBeGreaterThan(13.7);
    expect(coords!.lat).toBeLessThan(13.8);
  });

  it("maps train transport to train icon category", () => {
    const act: Activity = {
      name: "Vožnja z vlakom iz Bangkoka v Ayutthayo",
      transportType: "train",
      type: "TRANSPORT",
    };
    expect(resolveActivityMapCategory(act)).toBe("train");
  });

  it("uses airport IATA coords for flight legs", () => {
    const act: Activity = {
      name: "Notranji let Bangkok (DMK) -> Surat Thani (URT)",
      transportType: "flight",
    };
    const coords = resolveActivityCoordinates(act, bangkokDay);
    expect(coords).not.toBeNull();
    expect(coords!.lat).toBeCloseTo(13.9126, 1);
  });
});
