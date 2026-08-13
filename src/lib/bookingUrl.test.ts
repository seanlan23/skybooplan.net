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
    expect(url.searchParams.get("checkin_year")).toBe("2026");
    expect(url.searchParams.get("checkin_month")).toBe("10");
    expect(url.searchParams.get("group_adults")).toBe("2");
    expect(url.searchParams.get("aid")).toBe("7969731");
    expect(url.searchParams.get("src")).toBe("index");
  });

  it("includes dest_id so Booking keeps the city for signed-in users", () => {
    const url = new URL(
      buildBookingSearchUrl({
        destination: "New York",
        checkIn: "2026-09-20",
        checkOut: "2026-09-27",
        destId: "20088325",
        destType: "city",
        lang: "sl",
      }),
    );
    expect(url.searchParams.get("dest_id")).toBe("20088325");
    expect(url.searchParams.get("dest_type")).toBe("city");
    expect(url.searchParams.get("lang")).toBe("sl");
    expect(url.searchParams.get("src")).not.toBe("searchresults");
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

  it("forwards popular filters as Booking nflt", () => {
    const url = new URL(
      buildBookingSearchUrl({
        destination: "Berlin",
        checkIn: "2026-11-02",
        checkOut: "2026-11-04",
        nflt: ["mealplan=1", "ht_id=204"],
      }),
    );
    expect(url.searchParams.get("nflt")).toBe("mealplan=1;ht_id=204");
  });
});
