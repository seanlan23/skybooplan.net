import { describe, expect, it } from "vitest";
import type { AiTripPlan, DayPlan, ResortStay } from "@/lib/aiPlan.functions";
import { BOOKING_CLICK_HOP_PATH } from "@/lib/bookingUrl";
import {
  buildResortPackageFromOffer,
  buildResortPackageFromPlan,
  destinationBadgeLabel,
  flightStayDatesForBooking,
  inferPackageMealPlan,
  inferPackageTransferKind,
  resolvePackageCoverImage,
  resolvePackageCoverWithFallback,
  resortPackagesFromPlan,
} from "@/lib/resortPackage";

function hopDest(href: string | undefined): URL {
  expect(href).toBeTruthy();
  expect(href!.startsWith(`${BOOKING_CLICK_HOP_PATH}?`)).toBe(true);
  const dest = new URLSearchParams(href!.slice(href!.indexOf("?") + 1)).get("u");
  if (!dest) throw new Error(`expected hop dest, got ${href}`);
  return new URL(dest);
}

const stay = (over?: Partial<ResortStay>): ResortStay => ({
  arrivalProtocol: {
    visa_and_entry: "IMUGA",
    immigration: "Vrsta",
    baggage: "Trak 2",
    transfer_pickup: "Pult za gliser desno od izhoda.",
    cash_and_esim: "eSIM",
    ...over?.arrivalProtocol,
  },
  resortGuide: {
    check_in_out: "Prijava 14:00",
    all_inclusive_etiquette: "Zapestnica za all-inclusive restavracije.",
    tipping: "Napitnine",
    relaxing_at_resort: "Plaža",
    ...over?.resortGuide,
  },
  optionalExcursions: [],
  departureProtocol: {
    return_transfer: "Kombi 3 ure pred poletom.",
    airport_lead_time: "3 ure",
    flight_alignment: "Brez čakanja",
    ...over?.departureProtocol,
  },
});

const day = (over?: Partial<DayPlan>): DayPlan => ({
  day: 1,
  date: "2026-09-19",
  title: "Zanzibar",
  morning: "",
  afternoon: "",
  evening: "",
  travelHack: "",
  transportationTips: "",
  localWarnings: "",
  dailyBudgetEur: 0,
  lat: -5.72,
  lng: 39.3,
  focusName: "Nungwi",
  city: "Nungwi",
  category: "stay",
  ...over,
});

function plan(over?: Partial<AiTripPlan>): AiTripPlan {
  return {
    destinationName: "Zanzibar",
    summary: "En resort",
    totalBudgetEur: 1800,
    centerLat: -5.72,
    centerLng: 39.3,
    days: [day()],
    originIata: "LJU",
    destinationIata: "ZNZ",
    destinationPlace: "Zanzibar, Tanzanija",
    tripStyle: "single_base",
    resortStay: stay(),
    hotels: [{ city: "Nungwi", nights: 6, from_date: "2026-09-20", to_date: "2026-09-26" }],
    ...over,
  };
}

describe("inferPackageMealPlan", () => {
  it("detects all-inclusive from resort etiquette", () => {
    expect(inferPackageMealPlan(stay())).toBe("all_inclusive");
  });

  it("keeps breakfast-first destinations on B&B even if leftover wristband copy exists", () => {
    expect(inferPackageMealPlan(stay(), "breakfast_first")).toBe("breakfast");
  });

  it("falls back to breakfast when all-inclusive is not mentioned", () => {
    expect(
      inferPackageMealPlan(
        stay({
          resortGuide: {
            check_in_out: "Prijava",
            all_inclusive_etiquette: "Zajtrk v restavraciji, večerja po izbiri.",
            tipping: "",
            relaxing_at_resort: "",
          },
        }),
      ),
    ).toBe("breakfast");
  });
});

describe("inferPackageTransferKind", () => {
  it("detects speedboat, seaplane, and van from protocol copy", () => {
    expect(inferPackageTransferKind(stay())).toBe("speedboat");
    expect(
      inferPackageTransferKind(
        stay({ arrivalProtocol: { ...stay().arrivalProtocol, transfer_pickup: "Hidroplan s pulta" } }),
      ),
    ).toBe("seaplane");
    expect(
      inferPackageTransferKind(
        stay({
          arrivalProtocol: { ...stay().arrivalProtocol, transfer_pickup: "Kombi pred terminalom" },
          departureProtocol: { ...stay().departureProtocol, return_transfer: "isti kombi" },
        }),
      ),
    ).toBe("van");
  });
});

describe("buildResortPackageFromPlan", () => {
  it("uses destination as the title when no hotel name is provided", () => {
    const pkg = buildResortPackageFromPlan(plan(), {
      pax: 2,
      totalEur: 2580,
      departDate: "2026-09-19",
      returnDate: "2026-09-26",
      lang: "sl",
    });
    expect(pkg.title).toBe("Zanzibar");
    expect(pkg.destinationLabel).toBe("Zanzibar");
    expect(pkg.pricePerPersonEur).toBe(1290);
    expect(pkg.totalEur).toBe(2580);
    expect(pkg.pax).toBe(2);
    expect(pkg.guestScore).toBeUndefined();
    expect(pkg.originIata).toBe("LJU");
    expect(pkg.destinationIata).toBe("ZNZ");
    expect(pkg.includesCheckedBag).toBe(true);
    expect(pkg.mealPlan).toBe("all_inclusive");
    expect(pkg.transferKind).toBe("speedboat");
    expect(pkg.bookingHref).toMatch(/booking|go\/booking/i);
    expect(pkg.flightHref).toMatch(/skyscanner\.net\/transport\/flights\/lju\/znz/i);
    expect(pkg.coverImageUrl).toMatch(/^https:\/\//);
  });

  it("always returns an Unsplash or Pexels cover when the day has no photo", () => {
    const url = resolvePackageCoverImage(plan({ days: [day({ imageUrl: "" })] }), "Maldivi");
    expect(url).toMatch(/^https:\/\/(images\.unsplash\.com|images\.pexels\.com)\//);
    expect(resolvePackageCoverWithFallback(undefined, plan(), "Zanzibar")).toMatch(
      /^https:\/\//,
    );
    expect(resolvePackageCoverWithFallback("  ", plan(), "Zanzibar")).toMatch(/^https:\/\//);
  });

  it("adds selected flight + hotel nights when no forced total is passed", () => {
    const pkg = buildResortPackageFromPlan(plan(), {
      pax: 2,
      flightTotalEur: 1800,
      departDate: "2026-09-19",
      returnDate: "2026-09-26",
    });
    expect(pkg.flightEur).toBe(1800);
    expect(pkg.hotelEur).toBeGreaterThan(0);
    expect(pkg.totalEur).toBe(1800 + pkg.hotelEur);
    expect(pkg.pricePerPersonEur).toBe(Math.round(pkg.totalEur / 2));
  });

  it("prefers a Duffel booking URL over Skyscanner", () => {
    const pkg = buildResortPackageFromPlan(plan(), {
      pax: 2,
      flightTotalEur: 1800,
      departDate: "2026-09-19",
      returnDate: "2026-09-26",
      flightBookingUrl: "https://www.duffel.com/checkout/off_test",
    });
    expect(pkg.flightHref).toBe("https://www.duffel.com/checkout/off_test");
  });

  it("keeps a provided hotel name and Booking meal-plan filter", () => {
    const pkg = buildResortPackageFromPlan(
      plan({ hotels: [{ city: "Nungwi", name: "Paradise Island Resort & Spa", nights: 6 }] }),
      { pax: 2, totalEur: 2580, departDate: "2026-09-19", returnDate: "2026-09-26" },
    );
    expect(pkg.title).toBe("Paradise Island Resort & Spa");
    expect(destinationBadgeLabel("Maldivi, Indijski ocean")).toBe("Maldivi");
    expect(pkg.bookingHref).toMatch(/mealplan=9|ht_id=204|review_score=80|nflt/i);
  });

  it("builds one card per live resort offer on the same flight", () => {
    const pkgs = resortPackagesFromPlan(
      plan({
        resortOffers: [
          {
            id: "h1",
            tier: "value",
            name: "Value Bay Resort",
            hotelEur: 820,
            mealPlan: "breakfast",
            guestScore: 8.2,
            bookingHref: "https://www.booking.com/hotel/value.html",
          },
          {
            id: "h2",
            tier: "premium",
            name: "Palm All Inclusive",
            hotelEur: 2100,
            mealPlan: "all_inclusive",
            guestScore: 9.1,
            imageUrl: "https://images.example/palm.jpg",
            images: [
              "https://images.example/palm.jpg",
              "https://images.example/palm-pool.jpg",
              "https://images.example/palm-beach.jpg",
            ],
            bookingHref: "https://www.booking.com/hotel/palm.html",
          },
        ],
      }),
      { pax: 2, flightTotalEur: 1800, departDate: "2026-09-19", returnDate: "2026-09-26" },
    );
    expect(pkgs).toHaveLength(2);
    expect(pkgs[0]?.title).toBe("Value Bay Resort");
    expect(pkgs[0]?.totalEur).toBe(2620);
    expect(pkgs[0]?.pricePerPersonEur).toBe(1310);
    expect(pkgs[1]?.title).toBe("Palm All Inclusive");
    expect(pkgs[1]?.totalEur).toBe(3900);
    expect(pkgs[1]?.coverImageUrl).toContain("palm.jpg");
    expect(pkgs[1]?.images).toEqual([
      "https://images.example/palm.jpg",
      "https://images.example/palm-pool.jpg",
      "https://images.example/palm-beach.jpg",
    ]);
    const palm = hopDest(pkgs[1]?.bookingHref);
    expect(palm.pathname).toBe("/searchresults.html");
    expect(palm.searchParams.get("ss")).toMatch(/Palm All Inclusive/i);
    expect(palm.searchParams.get("review_score")).toBe("80");
  });

  it("hides resort offers below the 8.0 guest-score floor", () => {
    const pkgs = resortPackagesFromPlan(
      plan({
        resortOffers: [
          {
            id: "low",
            tier: "value",
            name: "Low Score Bay",
            hotelEur: 500,
            mealPlan: "breakfast",
            guestScore: 7.4,
          },
          {
            id: "ok",
            tier: "recommended",
            name: "High Score Bay",
            hotelEur: 900,
            mealPlan: "breakfast",
            guestScore: 8.6,
          },
        ],
      }),
      { pax: 2, flightTotalEur: 1800, departDate: "2026-09-19", returnDate: "2026-09-26" },
    );
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0]?.title).toBe("High Score Bay");
  });

  it("stamps Booking search with flight dates, destination, and guests — not hotel dates", () => {
    const pkg = buildResortPackageFromPlan(
      plan({ hotels: [{ city: "Nungwi", nights: 6, from_date: "2026-09-20", to_date: "2026-09-27" }] }),
      {
        pax: 2,
        adults: 2,
        rooms: 1,
        departDate: "2026-10-01",
        returnDate: "2026-10-08",
        lang: "sl",
      },
    );
    expect(pkg.checkIn).toBe("2026-10-01");
    expect(pkg.checkOut).toBe("2026-10-08");
    const url = hopDest(pkg.bookingHref);
    expect(url.searchParams.get("ss")).toMatch(/Nungwi|Zanzibar/i);
    expect(url.searchParams.get("ss")?.trim()).toBeTruthy();
    expect(url.searchParams.get("checkin")).toBe("2026-10-01");
    expect(url.searchParams.get("checkout")).toBe("2026-10-08");
    expect(url.searchParams.get("checkin_year")).toBe("2026");
    expect(url.searchParams.get("checkin_month")).toBe("10");
    expect(url.searchParams.get("checkin_monthday")).toBe("1");
    expect(url.searchParams.get("checkout_year")).toBe("2026");
    expect(url.searchParams.get("checkout_month")).toBe("10");
    expect(url.searchParams.get("checkout_monthday")).toBe("8");
    expect(url.searchParams.get("group_adults")).toBe("2");
    expect(url.searchParams.get("no_rooms")).toBe("1");
    expect(url.pathname).toBe("/searchresults.html");
    expect(url.searchParams.get("review_score")).toBe("80");
  });

  it("restamps a dateless hotel offer URL with the selected flight dates and hotel name", () => {
    const pkg = buildResortPackageFromOffer(
      plan({ destinationPlace: "Punta Cana", destinationName: "Punta Cana", destinationIata: "PUJ" }),
      {
        id: "h1",
        tier: "premium",
        name: "Xanadú Resort and Residences",
        hotelEur: 2100,
        mealPlan: "all_inclusive",
        bookingHref: "https://www.booking.com/hotel/do/xanadu.html",
      },
      { pax: 2, adults: 2, rooms: 1, departDate: "2026-10-01", returnDate: "2026-10-08" },
    );
    const url = hopDest(pkg.bookingHref);
    expect(url.searchParams.get("ss")).toMatch(/Xanadú|Punta Cana/i);
    expect(url.searchParams.get("checkin")).toBe("2026-10-01");
    expect(url.searchParams.get("checkout")).toBe("2026-10-08");
    expect(url.searchParams.get("group_adults")).toBe("2");
    expect(url.searchParams.get("no_rooms")).toBe("1");
    expect(url.pathname).toBe("/searchresults.html");
    expect(url.searchParams.get("review_score")).toBe("80");
    expect(url.searchParams.get("ss")).toBe("Xanadú Resort and Residences");
  });

  it("stamps Booking check-in on the destination arrival date for an overnight long-haul", () => {
    const pkg = buildResortPackageFromPlan(
      plan({ hotels: [{ city: "Phuket", nights: 11, from_date: "2026-10-26", to_date: "2026-11-06" }] }),
      {
        pax: 2,
        adults: 2,
        rooms: 1,
        departDate: "2026-10-26",
        returnDate: "2026-11-06",
        flights: {
          outboundDepart: "19:40",
          outboundArrive: "10:10",
          outboundArriveDayOffset: 1,
          inboundDepart: "09:25",
        },
        lang: "sl",
      },
    );
    expect(pkg.checkIn).toBe("2026-10-27");
    expect(pkg.checkOut).toBe("2026-11-06");
    const url = hopDest(pkg.bookingHref);
    expect(url.searchParams.get("checkin")).toBe("2026-10-27");
    expect(url.searchParams.get("checkout")).toBe("2026-11-06");
    expect(url.searchParams.get("checkin_monthday")).toBe("27");
    expect(url.searchParams.get("checkout_monthday")).toBe("6");
  });
});

describe("flightStayDatesForBooking", () => {
  it("does not use the home-airport ticket date as hotel check-in", () => {
    expect(
      flightStayDatesForBooking(
        {
          departDate: "2026-10-26",
          returnDate: "2026-11-06",
          flights: {
            outboundDepart: "19:40",
            outboundArrive: "10:10",
            outboundArriveDayOffset: 1,
          },
        },
        plan(),
      ),
    ).toEqual({ checkIn: "2026-10-27", checkOut: "2026-11-06" });
  });
});
