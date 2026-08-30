import { describe, expect, it } from "vitest";
import {
  allowedBookingDest,
  applyBookingNetworkTracking,
  BOOKING_CLICK_HOP_PATH,
  bookingClickHopHref,
  buildBookingSearchUrl,
  resolveBookingStayDates,
  resolveHotelBookingUrl,
  SKYBOOPLAN_CJ_CLICK_URL,
  toBookingClickHref,
  toAbsoluteBookingClickHref,
  toCjTrackedUrl,
  SKYBOOPLAN_SITE,
  renderBookingHopHtml,
} from "@/lib/bookingUrl";
import { packageBookingHref } from "@/lib/resortPackage";

function hopDest(href: string): URL {
  expect(href.startsWith(`${BOOKING_CLICK_HOP_PATH}?`)).toBe(true);
  const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  const dest = params.get("u");
  if (!dest) throw new Error(`expected hop dest, got ${href}`);
  return new URL(dest);
}

describe("buildBookingSearchUrl", () => {
  it("keeps city, dates, and guests, then hops through Skybooplan then CJ", () => {
    const href = buildBookingSearchUrl({
      destination: "Bangkok",
      checkIn: "2026-10-12",
      checkOut: "2026-10-18",
      adults: 2,
      rooms: 1,
      affiliateId: "7969731",
    });

    const url = hopDest(href);
    expect(url.hostname).toBe("www.booking.com");
    expect(url.searchParams.get("ss")).toBe("Bangkok");
    expect(url.searchParams.get("checkin")).toBe("2026-10-12");
    expect(url.searchParams.get("checkout")).toBe("2026-10-18");
    expect(url.searchParams.get("checkin_year")).toBe("2026");
    expect(url.searchParams.get("checkin_month")).toBe("10");
    expect(url.searchParams.get("group_adults")).toBe("2");
    expect(url.searchParams.get("no_rooms")).toBe("1");
    expect(url.searchParams.get("aid")).toBeNull();
    expect(url.searchParams.get("src")).toBeNull();
    expect(url.pathname).toBe("/searchresults.html");
    expect(url.searchParams.get("review_score")).toBe("80");
    expect(url.searchParams.get("checkin_monthday")).toBe("12");
    expect(url.searchParams.get("checkout_year")).toBe("2026");
    expect(url.searchParams.get("checkout_month")).toBe("10");
    expect(url.searchParams.get("checkout_monthday")).toBe("18");
  });

  it("locks the calendar with ISO dates plus year/month/monthday — no src=index", () => {
    const url = hopDest(
      buildBookingSearchUrl({
        destination: "Phuket",
        checkIn: "2026-11-21",
        checkOut: "2026-11-30",
        lang: "sl",
      }),
    );
    expect(url.searchParams.get("checkin")).toBe("2026-11-21");
    expect(url.searchParams.get("checkout")).toBe("2026-11-30");
    expect(url.searchParams.get("checkin_year")).toBe("2026");
    expect(url.searchParams.get("checkin_month")).toBe("11");
    expect(url.searchParams.get("checkin_monthday")).toBe("21");
    expect(url.searchParams.get("checkout_year")).toBe("2026");
    expect(url.searchParams.get("checkout_month")).toBe("11");
    expect(url.searchParams.get("checkout_monthday")).toBe("30");
    expect(url.searchParams.get("lang")).toBe("sl");
    expect(url.searchParams.get("src")).toBeNull();
    expect(url.searchParams.get("dest_id")).toBeNull();
    expect(url.pathname).toBe("/searchresults.html");
    expect(url.searchParams.get("review_score")).toBe("80");
  });

  it("still opens a destination search when affiliate id is missing", () => {
    const url = hopDest(
      buildBookingSearchUrl({
        destination: "Barcelona",
        checkIn: "2026-11-01",
        checkOut: "2026-11-05",
      }),
    );

    expect(url.searchParams.get("ss")).toBe("Barcelona");
    expect(url.searchParams.get("aid")).toBeNull();
    expect(url.pathname).toBe("/searchresults.html");
    expect(url.searchParams.get("review_score")).toBe("80");
  });

  it("forwards popular filters as Booking nflt", () => {
    const url = hopDest(
      buildBookingSearchUrl({
        destination: "Berlin",
        checkIn: "2026-11-02",
        checkOut: "2026-11-04",
        nflt: ["mealplan=1", "ht_id=204"],
      }),
    );
    expect(url.searchParams.get("nflt")).toBe("mealplan=1;ht_id=204");
    expect(url.searchParams.get("src")).toBeNull();
  });
});

describe("applyBookingNetworkTracking", () => {
  it("wraps Booking search through the CJ click URL and drops the old aid", () => {
    const booking =
      "https://www.booking.com/searchresults.html?ss=Dubai&checkin=2026-09-20&checkout=2026-09-27&aid=7969731";
    const tracked = applyBookingNetworkTracking(booking, {
      cjClickUrl: "https://www.anrdoezrs.net/click-10111111-15333333",
      label: "skybooplan-test",
    });
    const url = new URL(tracked);
    expect(url.hostname).toBe("www.anrdoezrs.net");
    expect(url.pathname).toBe("/click-10111111-15333333");
    const dest = new URL(url.searchParams.get("url") ?? "");
    expect(dest.hostname).toBe("www.booking.com");
    expect(dest.searchParams.get("ss")).toBe("Dubai");
    expect(dest.searchParams.get("checkin")).toBe("2026-09-20");
    expect(dest.searchParams.get("aid")).toBeNull();
    expect(dest.searchParams.get("label")).toBe("skybooplan-test");
  });

  it("leaves a Booking URL unchanged when CJ click is not configured", () => {
    const booking =
      "https://www.booking.com/searchresults.html?ss=Paris&aid=7969731";
    expect(
      applyBookingNetworkTracking(booking, { cjClickUrl: "" }),
    ).toBe(booking);
  });

  it("defaults to a Skybooplan hop that still encodes the Booking search", () => {
    const booking =
      "https://www.booking.com/searchresults.html?ss=New+York&checkin=2026-09-20&checkout=2026-09-27";
    const tracked = applyBookingNetworkTracking(booking);
    expect(hopDest(tracked).searchParams.get("ss")).toBe("New York");
    const cj = toCjTrackedUrl(hopDest(tracked).toString(), SKYBOOPLAN_CJ_CLICK_URL);
    expect(cj).toContain("jdoqocy.com/click-101761713-15735418");
  });

  it("rejects non-Booking destinations for the hop", () => {
    expect(allowedBookingDest("https://evil.example/phish")).toBeNull();
    expect(allowedBookingDest("https://www.booking.com.evil.test/")).toBeNull();
    expect(allowedBookingDest("https://www.booking.com/searchresults.html?ss=NY")).toContain(
      "booking.com",
    );
  });

  it("turns a leftover jdoqocy href into the Skybooplan hop", () => {
    const cj =
      "https://www.jdoqocy.com/click-101761713-15735418?url=" +
      encodeURIComponent(
        "https://www.booking.com/hotel/ae/atlantis.html?checkin=2026-09-20",
      );
    const tracked = applyBookingNetworkTracking(cj);
    expect(hopDest(tracked).pathname).toContain("/hotel/ae/atlantis.html");
  });
});

describe("packageBookingHref", () => {
  it("always opens searchresults with ss, flight dates, guests, and review_score", () => {
    const href = packageBookingHref({
      destination: "Cancun Riviera Maya",
      hotelName: "Occidental Costa Cancun",
      checkIn: "2026-10-01",
      checkOut: "2026-10-08",
      adults: 2,
      rooms: 1,
      incomingHref: "https://www.booking.com/",
    });
    const dest = hopDest(href!);
    expect(dest.pathname).toBe("/searchresults.html");
    expect(dest.searchParams.get("ss")).toBe("Occidental Costa Cancun");
    expect(dest.searchParams.get("checkin")).toBe("2026-10-01");
    expect(dest.searchParams.get("checkout")).toBe("2026-10-08");
    expect(dest.searchParams.get("checkin_year")).toBe("2026");
    expect(dest.searchParams.get("checkin_month")).toBe("10");
    expect(dest.searchParams.get("checkin_monthday")).toBe("1");
    expect(dest.searchParams.get("checkout_year")).toBe("2026");
    expect(dest.searchParams.get("checkout_month")).toBe("10");
    expect(dest.searchParams.get("checkout_monthday")).toBe("8");
    expect(dest.searchParams.get("group_adults")).toBe("2");
    expect(dest.searchParams.get("no_rooms")).toBe("1");
    expect(dest.searchParams.get("review_score")).toBe("80");
    expect(dest.toString()).not.toBe("https://www.booking.com/");
  });

  it("overwrites a mock/empty hotel date with the selected flight stay", () => {
    const href = packageBookingHref({
      destination: "Phuket",
      checkIn: "",
      checkOut: "not-a-date",
      hotelCheckIn: "2026-11-21",
      hotelCheckOut: "2026-11-30",
      adults: 2,
      rooms: 1,
    });
    const dest = hopDest(href!);
    expect(dest.searchParams.get("checkin")).toBe("2026-11-21");
    expect(dest.searchParams.get("checkout")).toBe("2026-11-30");
    expect(dest.searchParams.get("checkin_year")).toBe("2026");
    expect(dest.searchParams.get("checkin_month")).toBe("11");
    expect(dest.searchParams.get("checkin_monthday")).toBe("21");
    expect(dest.searchParams.get("checkout_monthday")).toBe("30");
  });
});

describe("resolveBookingStayDates", () => {
  it("prefers the selected flight over a stored hotel date", () => {
    expect(
      resolveBookingStayDates({
        flightDepartDate: "2026-11-21",
        flightReturnDate: "2026-11-30",
        checkIn: "2026-01-01",
        checkOut: "2026-01-08",
      }),
    ).toEqual({ checkIn: "2026-11-21", checkOut: "2026-11-30" });
  });

  it("locks Booking to destination arrival, not home-airport depart", () => {
    const href = packageBookingHref({
      destination: "Phuket",
      checkIn: "2026-10-26",
      checkOut: "2026-11-06",
      hotelCheckIn: "2026-10-27",
      hotelCheckOut: "2026-11-06",
      adults: 2,
      rooms: 1,
    });
    const dest = hopDest(href!);
    expect(dest.searchParams.get("checkin")).toBe("2026-10-27");
    expect(dest.searchParams.get("checkout")).toBe("2026-11-06");
    expect(dest.searchParams.get("checkin_monthday")).toBe("27");
  });
});

describe("resolveHotelBookingUrl", () => {
  it("rebuilds searchresults so a hotel page cannot open today's calendar", () => {
    const href = resolveHotelBookingUrl(
      "https://www.booking.com/hotel/ae/atlantis-the-palm.html?aid=304142",
      {
        destination: "Dubai",
        hotelName: "Atlantis The Palm",
        checkIn: "2026-09-20",
        checkOut: "2026-09-27",
        adults: 2,
        rooms: 1,
      },
    );
    const dest = hopDest(href);
    expect(dest.hostname).toBe("www.booking.com");
    expect(dest.pathname).toBe("/searchresults.html");
    expect(dest.searchParams.get("ss")).toBe("Atlantis The Palm");
    expect(dest.searchParams.get("checkin")).toBe("2026-09-20");
    expect(dest.searchParams.get("checkin_year")).toBe("2026");
    expect(dest.searchParams.get("checkin_monthday")).toBe("20");
    expect(dest.searchParams.get("aid")).toBeNull();
  });

  it("fills an empty ss and stamps flight dates on a searchresults URL", () => {
    const dest = hopDest(
      resolveHotelBookingUrl("https://www.booking.com/searchresults.html?ss=&src=index", {
        destination: "Punta Cana",
        hotelName: "Xanadú Resort and Residences",
        checkIn: "2026-10-01",
        checkOut: "2026-10-08",
        adults: 2,
        rooms: 1,
      }),
    );
    expect(dest.searchParams.get("ss")).toMatch(/Xanadú|Punta Cana/i);
    expect(dest.searchParams.get("ss")?.trim()).toBeTruthy();
    expect(dest.searchParams.get("checkin")).toBe("2026-10-01");
    expect(dest.searchParams.get("checkout")).toBe("2026-10-08");
    expect(dest.searchParams.get("checkin_year")).toBe("2026");
    expect(dest.searchParams.get("checkin_month")).toBe("10");
    expect(dest.searchParams.get("checkin_monthday")).toBe("1");
    expect(dest.searchParams.get("group_adults")).toBe("2");
    expect(dest.searchParams.get("no_rooms")).toBe("1");
  });

  it("builds ss from hotel name when the city is missing", () => {
    const dest = hopDest(
      buildBookingSearchUrl({
        destination: "",
        hotelName: "Xanadú Resort and Residences",
        checkIn: "2026-10-01",
        checkOut: "2026-10-08",
        adults: 2,
        rooms: 1,
      }),
    );
    expect(dest.searchParams.get("ss")).toBe("Xanadú Resort and Residences");
  });

  it("rebuilds searchresults when the API already returned a Skybooplan hop", () => {
    const inner =
      "https://www.booking.com/hotel/us/pod-times-square.html?checkin=2026-09-20";
    const href = resolveHotelBookingUrl(bookingClickHopHref(inner), {
      destination: "New York",
      hotelName: "Pod Times Square",
      checkIn: "2026-09-20",
      checkOut: "2026-09-27",
    });
    const dest = hopDest(href);
    expect(dest.pathname).toBe("/searchresults.html");
    expect(dest.searchParams.get("checkin")).toBe("2026-09-20");
    expect(dest.searchParams.get("checkout")).toBe("2026-09-27");
  });
});

describe("toAbsoluteBookingClickHref", () => {
  it("prefixes the site-relative hop for PDF / offline clicks", () => {
    expect(toAbsoluteBookingClickHref("/api/go/booking?u=https%3A%2F%2Fwww.booking.com%2F")).toBe(
      `${SKYBOOPLAN_SITE}/api/go/booking?u=https%3A%2F%2Fwww.booking.com%2F`,
    );
    expect(toAbsoluteBookingClickHref("https://www.booking.com/")).toBe(
      "https://www.booking.com/",
    );
  });
});

describe("toBookingClickHref", () => {
  it("never leaves a raw Booking.com URL on hotel card buttons", () => {
    const href = toBookingClickHref(
      "https://www.booking.com/hotel/es/w-barcelona.html",
    );
    expect(href.startsWith(BOOKING_CLICK_HOP_PATH)).toBe(true);
    expect(hopDest(href).pathname).toContain("/hotel/es/w-barcelona.html");
  });
});

describe("renderBookingHopHtml", () => {
  it("sends the browser to the CJ click URL in page JavaScript", () => {
    const html = renderBookingHopHtml(
      "https://www.jdoqocy.com/click-101761713-15735418?url=https%3A%2F%2Fwww.booking.com%2F",
    );
    expect(html).toContain("jdoqocy.com/click-101761713-15735418");
    expect(html).toContain("location.replace");
    expect(html).toContain("setTimeout");
  });
});
