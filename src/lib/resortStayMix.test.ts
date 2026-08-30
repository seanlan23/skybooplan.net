import { describe, expect, it } from "vitest";
import {
  isExcludedResortLocation,
  matchResortStayMix,
} from "@/lib/resortStayMix";

const mix = matchResortStayMix({ destIata: "MLE" })!;

describe("matchResortStayMix", () => {
  it("resolves the Maldives row from IATA or country, not from other hubs", () => {
    expect(matchResortStayMix({ destIata: "MLE" })?.countries).toContain("MV");
    expect(matchResortStayMix({ countryCode: "MV" })?.valueSlots).toBe(2);
    expect(matchResortStayMix({ destIata: "HKT" })).toBeNull();
  });
});

describe("isExcludedResortLocation", () => {
  it("drops Male city and Hulhumale, keeps North Male Atoll islands", () => {
    expect(
      isExcludedResortLocation({ name: "City Hotel Male", neighborhood: "Malé" }, mix),
    ).toBe(true);
    expect(
      isExcludedResortLocation({ name: "Hulhumale Beach Hotel", neighborhood: "Hulhumalé" }, mix),
    ).toBe(true);
    expect(
      isExcludedResortLocation(
        { name: "Bandos Maldives", neighborhood: "North Male Atoll" },
        mix,
      ),
    ).toBe(false);
    expect(
      isExcludedResortLocation(
        { name: "Adaaran Club Rannalhi", neighborhood: "South Male Atoll" },
        mix,
      ),
    ).toBe(false);
  });

  it("uses airport-island coordinates without dropping Bandos", () => {
    expect(isExcludedResortLocation({ name: "Airport Inn", lat: 4.1755, lng: 73.5093 }, mix)).toBe(
      true,
    );
    expect(isExcludedResortLocation({ name: "Bandos Maldives", lat: 4.27, lng: 73.492 }, mix)).toBe(
      false,
    );
  });
});
