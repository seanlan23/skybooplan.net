import { describe, expect, it } from "vitest";
import {
  formatDestinationAirportPick,
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
});
