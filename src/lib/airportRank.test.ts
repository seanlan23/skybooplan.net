import { describe, expect, it } from "vitest";
import { airportConfusionHint, rankAirportSuggestions } from "@/lib/airportRank";
import type { PlaceSuggestion } from "@/lib/places.functions";

const sdy: PlaceSuggestion = {
  iata: "SDY",
  name: "Sidney-Richland Municipal",
  city: "Sidney",
  country: "US",
  type: "airport",
};

describe("rankAirportSuggestions", () => {
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

  it("returns null for SYD", () => {
    expect(airportConfusionHint("VIE", "SYD")).toBeNull();
  });
});
