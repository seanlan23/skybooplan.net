import { describe, expect, it } from "vitest";
import {
  hotelSearchQueryAlias,
  pickBestBookingDestination,
} from "@/lib/hotelDestinationPick";

describe("hotelSearchQueryAlias", () => {
  it("maps Krabi to Ao Nang for tighter Booking results", () => {
    expect(hotelSearchQueryAlias("Krabi")).toBe("Ao Nang");
    expect(hotelSearchQueryAlias("Bangkok")).toBe("Bangkok");
    expect(hotelSearchQueryAlias("Thailand")).toBe("Bangkok");
    expect(hotelSearchQueryAlias("Tajska")).toBe("Bangkok");
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
});
