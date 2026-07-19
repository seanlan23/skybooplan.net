import { describe, expect, it } from "vitest";
import { buildGoogleMapsDirectionsUrl, isValidNavCoord } from "@/lib/navigationService";

describe("navigationService", () => {
  it("builds driving directions with origin → destination (Ao Nang)", () => {
    const url = buildGoogleMapsDirectionsUrl(8.0317, 98.8267, {
      label: "Ao Nang",
      originLat: 8.915,
      originLng: 98.529,
      travelMode: "driving",
    });
    expect(url).toContain("travelmode=driving");
    expect(url).toContain("destination=8.0317%2C98.8267");
    expect(url).toContain("origin=8.915%2C98.529");
    expect(url).not.toContain("travelmode=flying");
  });

  it("defaults to driving even without origin", () => {
    const url = buildGoogleMapsDirectionsUrl(8.0317, 98.8267);
    expect(url).toContain("travelmode=driving");
  });

  it("uses pier place queries for ferry Phi Phi → Rassada", () => {
    const url = buildGoogleMapsDirectionsUrl(7.8955, 98.4015, {
      originQuery: "Tonsai Pier, Koh Phi Phi, Thailand",
      destinationQuery: "Rassada Pier, Phuket, Thailand",
      travelMode: "transit",
    });
    expect(url).toContain("travelmode=transit");
    expect(url).toContain("origin=Tonsai+Pier");
    expect(url).toContain("destination=Rassada+Pier");
  });

  it("rejects invalid coords", () => {
    expect(isValidNavCoord(0, 0)).toBe(false);
    expect(isValidNavCoord(8.03, 98.82)).toBe(true);
  });
});
