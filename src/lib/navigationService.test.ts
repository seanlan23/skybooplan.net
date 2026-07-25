import { describe, expect, it } from "vitest";
import {
  buildGoogleMapsDirectionsUrl,
  isValidNavCoord,
  resolveDayNavOrigin,
} from "@/lib/navigationService";

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

  it("resolveDayNavOrigin uses hotel area + day city (not GPS)", () => {
    const origin = resolveDayNavOrigin({
      city: "Kanchanaburi",
      lat: 14.022,
      lng: 99.532,
    });
    expect(origin.originQuery).toMatch(/Hotel area,\s*Kanchanaburi/i);
    expect(origin.originLat).toBeCloseTo(14.022, 2);
    expect(origin.originLng).toBeCloseTo(99.532, 2);

    const url = buildGoogleMapsDirectionsUrl(13.407, 99.994, {
      ...origin,
      destinationQuery: "Maeklong Railway Market",
      travelMode: "driving",
    });
    expect(url).toContain("origin=Hotel+area");
    expect(url).toContain("Kanchanaburi");
    expect(url).toContain("destination=Maeklong");
    expect(url).not.toMatch(/Your\+location|Va%C5%A1a/i);
  });
});
