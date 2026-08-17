import { describe, expect, it } from "vitest";
import {
  mergePlaceSuggestions,
  roadPlaceFromDestination,
  searchNamedPlaces,
} from "@/lib/namedPlaces";

describe("searchNamedPlaces", () => {
  it("returns Albania the country for Albanija — not TIA", () => {
    const hits = searchNamedPlaces("Albanija");
    expect(hits[0]?.name).toBe("Albanija");
    expect(hits.every((h) => h.type === "city")).toBe(true);
    expect(hits.every((h) => !/^[A-Z]{3}$/.test(h.iata))).toBe(true);
  });

  it("returns Split the city, not an airport", () => {
    const hits = searchNamedPlaces("Split");
    expect(hits[0]?.name).toBe("Split");
    expect(hits[0]?.country).toBe("HR");
  });
});

describe("mergePlaceSuggestions", () => {
  it("drops remote airport rows", () => {
    const merged = mergePlaceSuggestions("Albanija", [
      {
        iata: "TIA",
        name: "Tirana",
        city: "Tirana",
        country: "AL",
        type: "airport",
      },
    ]);
    expect(merged.some((s) => s.iata === "TIA")).toBe(false);
    expect(merged[0]?.name).toBe("Albanija");
  });
});

describe("roadPlaceFromDestination", () => {
  it("strips airport codes from a typed destination", () => {
    expect(roadPlaceFromDestination("Tirana (TIA)")).toBe("Tirana");
    expect(roadPlaceFromDestination("TIA Tirana")).toBe("Tirana");
    expect(roadPlaceFromDestination("Albanija")).toBe("Albanija");
  });
});
