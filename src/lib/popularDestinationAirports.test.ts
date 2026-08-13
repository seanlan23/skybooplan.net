import { describe, expect, it } from "vitest";
import {
  formatDestinationAirportPick,
  resolveCountryDestinationHubs,
  searchDestinationAirports,
} from "@/lib/popularDestinationAirports";

describe("searchDestinationAirports", () => {
  it("suggests Barcelona (BCN) immediately", () => {
    const hits = searchDestinationAirports("barcel");
    expect(hits[0]?.iata).toBe("BCN");
    expect(hits[0]?.city).toMatch(/Barcelona/i);
  });

  it("suggests Manila (MNL) immediately", () => {
    const hits = searchDestinationAirports("manila");
    expect(hits[0]?.iata).toBe("MNL");
  });

  it("suggests Astana (NQZ) with the city name", () => {
    const hits = searchDestinationAirports("Astana");
    expect(hits[0]?.iata).toBe("NQZ");
    expect(hits[0]?.city).toBe("Astana");
    expect(formatDestinationAirportPick(hits[0]!)).toEqual({
      value: "Astana (NQZ)",
      label: "Astana (NQZ)",
    });
  });

  it("does not suggest European hubs for Kazakhstan", () => {
    const iatas = searchDestinationAirports("Kazahstan").map((h) => h.iata);
    expect(iatas).toEqual(["NQZ", "ALA"]);
  });

  it("does not fuzzy-match unrelated hubs for phuke", () => {
    const hits = searchDestinationAirports("phuke");
    expect(hits.map((h) => h.iata)).toEqual(["HKT"]);
  });

  it("formats pick with IATA for Make/AI resolution", () => {
    expect(
      formatDestinationAirportPick({
        iata: "BCN",
        name: "Barcelona El Prat",
        city: "Barcelona",
        country: "ES",
        type: "airport",
      }),
    ).toEqual({ value: "Barcelona (BCN)", label: "Barcelona (BCN)" });
  });

  it.each([
    ["egipt", ["CAI", "HRG"]],
    ["Egypt", ["CAI", "HRG"]],
    ["Malezija", ["KUL", "PEN"]],
    ["malaysia", ["KUL", "PEN"]],
    ["Indonezija", ["CGK", "DPS"]],
    ["Indonesia", ["CGK", "DPS"]],
    ["✈️ Indonezija", ["CGK", "DPS"]],
    ["tajska", ["BKK", "HKT"]],
    ["filipini", ["MNL", "CEB"]],
    ["japonska", ["NRT", "HND"]],
    ["kuba", ["HAV", "VRA"]],
    ["Cuba", ["HAV", "VRA"]],
    ["namibija", ["WDH", "ERS"]],
    ["Namibia", ["WDH", "ERS"]],
    ["bocvana", ["GBE", "MUB"]],
    ["Botswana", ["GBE", "MUB"]],
    ["jamajka", ["MBJ", "KIN"]],
    ["kostarika", ["SJO", "LIR"]],
    ["kanada", ["YYZ", "YVR"]],
    ["Canada", ["YYZ", "YVR"]],
    ["Namibia", ["WDH", "ERS"]],
    ["Kuba", ["HAV", "VRA"]],
    ["Simbabwe", ["HRE", "VFA"]],
    ["Tunesien", ["TUN", "DJE"]],
    ["Neuseeland", ["AKL", "CHC"]],
    ["Jamaika", ["MBJ", "KIN"]],
    ["kazahstan", ["NQZ", "ALA"]],
    ["Kazakhstan", ["NQZ", "ALA"]],
  ])("country %s returns ≥2 main hubs", (query, expected) => {
    const hits = searchDestinationAirports(query);
    const iatas = hits.map((h) => h.iata);
    expect(iatas.length).toBeGreaterThanOrEqual(2);
    for (const code of expected) {
      expect(iatas).toContain(code);
    }
    expect(resolveCountryDestinationHubs(query).length).toBeGreaterThanOrEqual(2);
  });
});
