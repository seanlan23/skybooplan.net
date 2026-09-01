import { describe, expect, it } from "vitest";
import {
  hotelCapitalFallback,
  hotelSearchQueryAlias,
  hotelSearchQueryForStay,
  pickBestBookingDestination,
} from "@/lib/hotelDestinationPick";

describe("hotelSearchQueryAlias", () => {
  it("maps Krabi to Ao Nang for tighter Booking results", () => {
    expect(hotelSearchQueryAlias("Krabi")).toBe("Ao Nang");
    expect(hotelSearchQueryAlias("Bangkok")).toBe("Bangkok");
    expect(hotelSearchQueryAlias("phi phi don")).toBe("Ko Phi Phi Don");
  });

  it("keeps country names as countries, not capitals", () => {
    expect(hotelSearchQueryAlias("Thailand")).toBe("Thailand");
    expect(hotelSearchQueryAlias("Tajska")).toBe("Thailand");
    expect(hotelSearchQueryAlias("Slovenia")).toBe("Slovenia");
    expect(hotelSearchQueryAlias("Slovenija")).toBe("Slovenia");
    expect(hotelSearchQueryAlias("Maldivi")).toBe("Maldives");
    expect(hotelSearchQueryAlias("Maldivi (MLE)")).toBe("Maldives");
    expect(hotelSearchQueryAlias("MLE")).toBe("Maldives");
    expect(hotelSearchQueryForStay("Maldivi (MLE)", "MLE")).toBe("Maldives");
  });

  it("sends only the city to Booking, never a localized country tail", () => {
    expect(hotelSearchQueryAlias("Punta Cana, Dominikanska republika")).toBe("Punta Cana");
    expect(hotelSearchQueryForStay("Punta Cana, Dominikanska republika", "PUJ")).toBe("Punta Cana");
    expect(hotelSearchQueryForStay("Phuket, Tajska", "HKT")).toBe("Phuket");
    expect(hotelSearchQueryForStay("PUJ", "PUJ")).toBe("Punta Cana");
  });
});

describe("pickBestBookingDestination", () => {
  it("prefers city over broad region for Krabi / Ao Nang", () => {
    const picked = pickBestBookingDestination("Ao Nang", [
      {
        dest_id: "1",
        search_type: "region",
        label: "Krabi Province, Thailand",
      },
      {
        dest_id: "2",
        search_type: "city",
        label: "Ao Nang, Krabi, Thailand",
      },
      {
        dest_id: "3",
        search_type: "region",
        label: "Koh Lanta, Krabi, Thailand",
      },
    ]);
    expect(picked?.dest_id).toBe("2");
  });

  it("penalizes Lanta when searching Krabi", () => {
    const picked = pickBestBookingDestination("Krabi", [
      { dest_id: "1", search_type: "region", label: "Koh Lanta" },
      { dest_id: "2", search_type: "city", label: "Krabi Town" },
    ]);
    expect(picked?.dest_id).toBe("2");
  });

  it("prefers the country dest when the query is a country", () => {
    const picked = pickBestBookingDestination("Slovenia", [
      { dest_id: "-123", search_type: "city", label: "Ljubljana, Slovenia" },
      { dest_id: "202", search_type: "country", label: "Slovenia" },
    ]);
    expect(picked?.dest_id).toBe("202");
    expect(hotelCapitalFallback("Slovenija")).toBe("Ljubljana");
  });

  it("keeps the dest in the flight country when Booking also returns another country", () => {
    const picked = pickBestBookingDestination(
      "Maldives",
      [
        { dest_id: "401", search_type: "city", label: "Bijeljina, Bosnia", cc1: "ba" },
        { dest_id: "88", search_type: "country", label: "Maldives", cc1: "mv" },
      ],
      { countryCode: "MV" },
    );
    expect(picked?.dest_id).toBe("88");
  });

  it("does not fall back to another country when the IATA country is known", () => {
    const picked = pickBestBookingDestination(
      "Maldivi",
      [
        { dest_id: "401", search_type: "city", label: "Bijeljina, Bosnia", cc1: "ba" },
        { dest_id: "402", search_type: "city", label: "Harmony, Republika Srpska", cc1: "ba" },
      ],
      { countryCode: "MV" },
    );
    expect(picked).toBeNull();
  });

  it("prefers a beach dest over Phuket Town when the ticket is HKT", () => {
    const picked = pickBestBookingDestination(
      "Phuket",
      [
        { dest_id: "1", search_type: "city", label: "Phuket Town, Thailand", cc1: "th" },
        { dest_id: "2", search_type: "district", label: "Kata Beach, Phuket, Thailand", cc1: "th" },
      ],
      { countryCode: "TH", destIata: "HKT" },
    );
    expect(picked?.dest_id).toBe("2");
  });
});
