import { describe, expect, it } from "vitest";
import { airportConfusionHint, rankAirportSuggestions, remapConfusedDestinationIata } from "@/lib/airportRank";
import type { PlaceSuggestion } from "@/lib/places.functions";

const sdy: PlaceSuggestion = {
  iata: "SDY",
  name: "Sidney-Richland Municipal",
  city: "Sidney",
  country: "US",
  type: "airport",
};

describe("rankAirportSuggestions", () => {
  it("keeps Astana (NQZ) and drops unrelated European airports", () => {
    const ranked = rankAirportSuggestions("Astana", [
      { iata: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "DE", type: "airport" },
      { iata: "GVA", name: "Geneva Airport", city: "Geneva", country: "CH", type: "airport" },
      { iata: "HAM", name: "Hamburg Airport", city: "Hamburg", country: "DE", type: "airport" },
    ]);
    expect(ranked[0]?.iata).toBe("NQZ");
    expect(ranked[0]?.city).toBe("Astana");
    expect(ranked.map((h) => h.iata)).not.toContain("FRA");
    expect(ranked.map((h) => h.iata)).not.toContain("GVA");
  });

  it("prefers SYD over SDY for sydney query", () => {
    const ranked = rankAirportSuggestions("sydney", [sdy]);
    expect(ranked[0]?.iata).toBe("SYD");
  });

  it("prefers SYD for sidney typo", () => {
    const ranked = rankAirportSuggestions("sidney", [sdy]);
    expect(ranked[0]?.iata).toBe("SYD");
  });
});

describe("airportConfusionHint", () => {
  it("warns when destination is SDY", () => {
    expect(airportConfusionHint("VIE", "SDY")).toBe("error.sydneyNotSidney");
  });

  it("warns when destination is Albany instead of Albania", () => {
    expect(airportConfusionHint("VIE", "ALB")).toBe("error.albaniaNotAlbany");
  });

  it("returns null for SYD", () => {
    expect(airportConfusionHint("VIE", "SYD")).toBeNull();
  });
});

describe("remapConfusedDestinationIata", () => {
  it("rewrites ALB to TIA on a European car trip to Albania", () => {
    expect(
      remapConfusedDestinationIata("ALB", {
        hint: "Albanija",
        originIata: "VIE",
        groundTransportMode: "car",
      }),
    ).toBe("TIA");
  });

  it("keeps Albany NY when the user actually asked for Albany", () => {
    expect(
      remapConfusedDestinationIata("ALB", {
        hint: "Albany New York",
        originIata: "JFK",
      }),
    ).toBe("ALB");
  });
});
