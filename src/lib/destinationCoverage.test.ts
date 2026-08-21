import { describe, expect, it } from "vitest";
import { lookupDestination, PHASE1_HUB_IATA } from "@/lib/destinationCoords";
import { COUNTRY_PATTERNS, extractTripIntent } from "@/lib/tripIntent";
import { isForeignPoiForRegion } from "@/lib/tripContent";
import type { TripRegion } from "@/lib/aiPlan.functions";

const region = (city: string, country?: string): TripRegion => ({
  city,
  startDay: 1,
  endDay: 3,
  summary: "",
  lat: 0,
  lng: 0,
  highlights: [],
});

describe("Phase 1 hub IATA coverage", () => {
  it("resolves all 53 phase-1 hubs", () => {
    expect(PHASE1_HUB_IATA.length).toBeGreaterThanOrEqual(50);
    for (const iata of PHASE1_HUB_IATA) {
      const dest = lookupDestination(iata);
      expect(dest, `missing ${iata}`).not.toBeNull();
      expect(dest!.name.length).toBeGreaterThan(1);
      expect(dest!.country).toMatch(/^[A-Z]{2}$/);
      expect(Math.abs(dest!.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(dest!.lng)).toBeLessThanOrEqual(180);
    }
  });

  it("has unique primary hub names (no accidental dupes in list)", () => {
    const names = PHASE1_HUB_IATA.map((i) => lookupDestination(i)!.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("resolves MEX as Mexico City, not Cancún", () => {
    expect(lookupDestination("MEX")?.name).toBe("Mexico City");
    expect(lookupDestination("CUN")?.name).toBe("Cancún");
  });
});

describe("tripIntent country patterns (phase 1)", () => {
  const samples: Array<{ wishes: string; country: string }> = [
    { wishes: "potovanje po Parizu", country: "FR" },
    { wishes: "trip to London and Scotland", country: "GB" },
    { wishes: "Barcelona in Madrid", country: "ES" },
    { wishes: "Roma in Firenze", country: "IT" },
    { wishes: "Amsterdam kanali", country: "NL" },
    { wishes: "Tokyo in Kyoto", country: "JP" },
    { wishes: "Seoul street food", country: "KR" },
    { wishes: "Hong Kong skyline", country: "HK" },
    { wishes: "Dubai marina", country: "AE" },
    { wishes: "Sydney opera", country: "AU" },
    { wishes: "Queenstown adventure", country: "NZ" },
    { wishes: "Las Vegas shows", country: "US" },
    { wishes: "Toronto in Niagara", country: "CA" },
    { wishes: "Machu Picchu iz Cusca", country: "PE" },
    { wishes: "Rio de Janeiro plaže", country: "BR" },
    { wishes: "Marrakech souk", country: "MA" },
    { wishes: "Cairo pyramids", country: "EG" },
    { wishes: "Cape Town Table Mountain", country: "ZA" },
    { wishes: "Zanzibar beach", country: "TZ" },
    { wishes: "Maldives resort", country: "MV" },
    { wishes: "Siem Reap Angkor", country: "KH" },
    { wishes: "Prague old town", country: "CZ" },
    { wishes: "Budapest thermal baths", country: "HU" },
    { wishes: "Reykjavik northern lights", country: "IS" },
    { wishes: "Cyprus Ayia Napa", country: "CY" },
    { wishes: "Istanbul bazaar", country: "TR" },
    { wishes: "Singapur gardens", country: "SG" },
    { wishes: "potovanje na Havaje", country: "US" },
  ];

  it(`covers ${samples.length} representative wishes`, () => {
    for (const { wishes, country } of samples) {
      const intent = extractTripIntent(wishes);
      expect(intent.countries, `"${wishes}" → ${country}`).toContain(country);
    }
  });

  it("infers country from IATA alone", () => {
    for (const iata of PHASE1_HUB_IATA) {
      const intent = extractTripIntent(undefined, { destinationIata: iata });
      expect(intent.countries.length).toBeGreaterThan(0);
    }
  });

  it("has at least 40 country patterns", () => {
    expect(COUNTRY_PATTERNS.length).toBeGreaterThanOrEqual(40);
  });
});

describe("REGION_LOCKED_POI phase-1 guards", () => {
  const foreignCases: Array<{ poi: string; city: string; country: string }> = [
    { poi: "Colosseum", city: "Bangkok", country: "TH" },
    { poi: "Sagrada Familia", city: "Tokyo", country: "JP" },
    { poi: "Big Ben", city: "Barcelona", country: "ES" },
    { poi: "Statue of Liberty", city: "Rome", country: "IT" },
    { poi: "Senso-ji Temple", city: "Paris", country: "FR" },
    { poi: "Acropolis Museum", city: "Dubai", country: "AE" },
    { poi: "Brandenburg Gate", city: "Sydney", country: "AU" },
    { poi: "Rijksmuseum", city: "Marrakech", country: "MA" },
    { poi: "Sydney Opera House", city: "Amsterdam", country: "NL" },
    { poi: "Hagia Sophia", city: "New York", country: "US" },
  ];

  for (const { poi, city, country } of foreignCases) {
    it(`blocks ${poi} in ${city}`, () => {
      expect(isForeignPoiForRegion(poi, region(city), country)).toBe(true);
    });
  }

  it("allows Colosseum in Rome", () => {
    expect(isForeignPoiForRegion("Colosseum", region("Rome"), "IT")).toBe(false);
  });

  it("allows Sydney Opera House in Sydney", () => {
    expect(isForeignPoiForRegion("Sydney Opera House", region("Sydney"), "AU")).toBe(false);
  });
});
