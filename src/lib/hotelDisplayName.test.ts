import { describe, expect, it } from "vitest";
import { cleanHotelDisplayName } from "@/lib/hotelDisplayName";

describe("cleanHotelDisplayName", () => {
  it("strips Booking promo tails after with / special offer / percent off", () => {
    expect(
      cleanHotelDisplayName(
        "Radisson Blu Resort Maldives with 50 percent off on Sea Plane round trip 03 nights & above",
      ),
    ).toBe("Radisson Blu Resort Maldives");
    expect(cleanHotelDisplayName("Coral Resort special offer weekend package")).toBe("Coral Resort");
    expect(cleanHotelDisplayName("Palm Villa - 50% off seaplane transfer")).toBe("Palm Villa");
  });

  it("keeps ordinary hotel names", () => {
    expect(cleanHotelDisplayName("Bandos Maldives")).toBe("Bandos Maldives");
    expect(cleanHotelDisplayName("Hotel with Pool")).toBe("Hotel with Pool");
  });
});
