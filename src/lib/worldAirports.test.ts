import { describe, expect, it } from "vitest";
import { searchWorldAirports, worldAirportCount } from "@/lib/worldAirports";
import { searchDestinationAirports } from "@/lib/popularDestinationAirports";

describe("world airport catalog", () => {
  it("ships thousands of IATA airports, not a short hand list", () => {
    expect(worldAirportCount()).toBeGreaterThan(4000);
  });

  it("finds Astana by city and IATA", () => {
    const byCity = searchWorldAirports("Astana");
    expect(byCity[0]?.iata).toBe("NQZ");
    expect(byCity[0]?.city).toBe("Astana");
    expect(searchWorldAirports("NQZ")[0]?.city).toBe("Astana");
  });

  it("finds Kazakhstan hubs from the Slovenian country name", () => {
    const hits = searchWorldAirports("Kazahstan");
    const iatas = hits.map((h) => h.iata);
    expect(iatas).toContain("NQZ");
    expect(iatas).toContain("ALA");
    expect(hits.find((h) => h.iata === "NQZ")?.city).toBe("Astana");
    expect(hits.find((h) => h.iata === "ALA")?.city).toBe("Almaty");
  });

  it("finds major cities worldwide", () => {
    expect(searchWorldAirports("Tokyo").some((h) => ["HND", "NRT"].includes(h.iata))).toBe(true);
    expect(searchWorldAirports("Cape Town")[0]?.iata).toBe("CPT");
    expect(searchWorldAirports("Ulaanbaatar").some((h) => ["UBN", "ULN"].includes(h.iata))).toBe(
      true,
    );
  });
});

describe("destination search uses the world catalog", () => {
  it("returns Astana (NQZ) for Astana", () => {
    const hits = searchDestinationAirports("Astana");
    expect(hits[0]?.iata).toBe("NQZ");
    expect(hits[0]?.city).toBe("Astana");
  });
});
