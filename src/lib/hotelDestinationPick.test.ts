import { describe, expect, it } from "vitest";
import {
  hotelCapitalFallback,
  hotelSearchQueryAlias,
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
});
