import { describe, expect, it } from "vitest";
import {
  applyHotelFilters,
  perNightPrice,
  sortHotels,
  stayNights,
} from "./hotelResults";

describe("stayNights", () => {
  it("counts nights between ISO dates", () => {
    expect(stayNights("2026-11-02", "2026-11-04")).toBe(2);
    expect(stayNights("2026-11-02")).toBe(1);
  });
});

describe("hotel result filters", () => {
  const hotels = [
    { id: "a", price: 200, rating: 8.4, stars: 4, reviews: 120 },
    { id: "b", price: 80, rating: 6.2, stars: 3, reviews: 20 },
    { id: "c", price: 140, rating: 9.1, stars: 5, reviews: 40 },
  ];

  it("filters by nightly budget and rating", () => {
    const nights = 2;
    const out = applyHotelFilters(hotels, nights, {
      maxPerNight: 80,
      minRating: 8,
      stars: [],
    });
    expect(out.map((h) => h.id)).toEqual(["c"]);
  });

  it("sorts top picks by rating weighted with reviews", () => {
    const sorted = sortHotels(hotels, "top");
    expect(sorted[0]!.id).toBe("a");
  });

  it("computes per-night from stay total", () => {
    expect(perNightPrice(200, 2)).toBe(100);
  });

  it("does not empty the list when amenity data is missing", () => {
    const out = applyHotelFilters(hotels, 2, {
      maxPerNight: 400,
      minRating: 0,
      stars: [],
      breakfast: true,
      balcony: true,
    });
    expect(out.map((h) => h.id)).toEqual(["a", "b", "c"]);
  });

  it("filters amenities only when at least one hotel has that flag", () => {
    const withFlags = [
      { id: "a", price: 200, rating: 8, amenities: { breakfast: true, balcony: false } },
      { id: "b", price: 80, rating: 7, amenities: { breakfast: false, balcony: true } },
    ];
    const out = applyHotelFilters(withFlags, 1, {
      maxPerNight: 400,
      minRating: 0,
      stars: [],
      breakfast: true,
    });
    expect(out.map((h) => h.id)).toEqual(["a"]);
  });
});
