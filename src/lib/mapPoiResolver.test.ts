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

  it("focuses Manila arrival card on MNL, not leftover Milan MXP coords", () => {
    const manilaDay: DayPlan = {
      day: 2,
      date: "2026-10-24",
      title: "Prihod v Manilo",
      morning: "",
      afternoon: "",
      evening: "",
      city: "Manila",
      lat: 14.599,
      lng: 120.984,
    };
    const act: Activity = {
      name: "Prihod na letališče",
      type: "TRANSPORT",
      description:
        "Polet pristane na destinaciji ob 11:30. Orientacija v arrival hallu. Manila (MNL).",
      // Gemini sometimes stamps origin-airport coords onto arrival logistics.
      lat: 45.63,
      lng: 8.723,
    };
    const coords = resolveActivityCoordinates(act, manilaDay);
    expect(coords).not.toBeNull();
    expect(coords!.lat).toBeCloseTo(14.599, 1);
    expect(coords!.lng).toBeCloseTo(120.984, 1);
  });

  it("focuses origin departure card on MXP", () => {
    const originDay: DayPlan = {
      day: 1,
      date: "2026-10-23",
      title: "Odhod",
      morning: "",
      afternoon: "",
      evening: "",
      city: "Milan",
      lat: 45.63,
      lng: 8.723,
    };
    const act: Activity = {
      name: "Odhod: Milan (MXP)",
      type: "TRANSPORT",
      description: "Na mednarodni let pridi 2–3 ure pred odletom.",
    };
    const coords = resolveActivityCoordinates(act, originDay);
    expect(coords).not.toBeNull();
    expect(coords!.lat).toBeCloseTo(45.63, 1);
  });
});
