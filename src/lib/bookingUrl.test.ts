import { describe, expect, it } from "vitest";
import { buildBookingSearchUrl } from "@/lib/bookingUrl";

describe("buildBookingSearchUrl", () => {
  it("keeps city, dates, guests, and affiliate id on the Booking link", () => {
    const url = new URL(
      buildBookingSearchUrl({
        destination: "Bangkok",
        checkIn: "2026-10-12",
        checkOut: "2026-10-18",
        adults: 2,
        rooms: 1,
        affiliateId: "7969731",
      }),
    );

    expect(url.hostname).toBe("www.booking.com");
    expect(url.searchParams.get("ss")).toBe("Bangkok");
    expect(url.searchParams.get("checkin")).toBe("2026-10-12");
    expect(url.searchParams.get("checkout")).toBe("2026-10-18");
    expect(url.searchParams.get("group_adults")).toBe("2");
    expect(url.searchParams.get("aid")).toBe("7969731");
  });

  it("still opens a destination search when affiliate id is missing", () => {
    const url = new URL(
      buildBookingSearchUrl({
        destination: "Barcelona",
        checkIn: "2026-11-01",
        checkOut: "2026-11-05",
      }),
    );

    expect(url.searchParams.get("ss")).toBe("Barcelona");
    expect(url.searchParams.get("aid")).toBeNull();
  });
});
