import { describe, expect, it } from "vitest";
import {
  applyBookingNetworkTracking,
  buildBookingSearchUrl,
  SKYBOOPLAN_CJ_CLICK_URL,
} from "@/lib/bookingUrl";

function innerBookingUrl(href: string): URL {
  const click = new URL(href);
  const dest = click.searchParams.get("url");
  if (!dest) throw new Error(`expected CJ wrap, got ${href}`);
  return new URL(dest);
}

describe("buildBookingSearchUrl", () => {
  it("keeps city, dates, and guests, then hops through the CJ click URL", () => {
    const href = buildBookingSearchUrl({
      destination: "Bangkok",
      checkIn: "2026-10-12",
      checkOut: "2026-10-18",
      adults: 2,
      rooms: 1,
      affiliateId: "7969731",
    });
    const click = new URL(href);
    const expected = new URL(SKYBOOPLAN_CJ_CLICK_URL);

    expect(click.hostname).toBe(expected.hostname);
    expect(click.pathname).toBe(expected.pathname);

    const url = innerBookingUrl(href);
    expect(url.hostname).toBe("www.booking.com");
    expect(url.searchParams.get("ss")).toBe("Bangkok");
    expect(url.searchParams.get("checkin")).toBe("2026-10-12");
    expect(url.searchParams.get("checkout")).toBe("2026-10-18");
    expect(url.searchParams.get("checkin_year")).toBe("2026");
    expect(url.searchParams.get("checkin_month")).toBe("10");
    expect(url.searchParams.get("group_adults")).toBe("2");
    expect(url.searchParams.get("aid")).toBeNull();
    expect(url.searchParams.get("src")).toBe("index");
  });

  it("includes dest_id so Booking keeps the city for signed-in users", () => {
    const url = innerBookingUrl(
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
    const url = innerBookingUrl(
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
    const url = innerBookingUrl(
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

  it("defaults to the Skybooplan jdoqocy click hop", () => {
    const booking =
      "https://www.booking.com/searchresults.html?ss=New+York&checkin=2026-09-20&checkout=2026-09-27";
    const tracked = applyBookingNetworkTracking(booking);
    const click = new URL(tracked);
    const expected = new URL(SKYBOOPLAN_CJ_CLICK_URL);
    expect(click.hostname).toBe(expected.hostname);
    expect(click.pathname).toBe(expected.pathname);
    expect(innerBookingUrl(tracked).searchParams.get("ss")).toBe("New York");
  });
});
