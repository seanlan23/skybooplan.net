import { describe, expect, it } from "vitest";
import {
  bookingCategoriesFilterFor,
  bookingNfltFor,
  inferHotelAmenities,
  inferHotelKind,
} from "./hotelAmenities";

describe("inferHotelKind", () => {
  it("maps Booking type ids", () => {
    expect(inferHotelKind(204)).toBe("hotel");
    expect(inferHotelKind(201)).toBe("apartment");
  });
});

describe("inferHotelAmenities", () => {
  it("reads all-inclusive from benefit badge text", () => {
    const out = inferHotelAmenities({
      name: "Iberostar Selection",
      badges: "All-inclusive Included_14",
    });
    expect(out.amenities.allInclusive).toBe(true);
  });

  it("reads breakfast, balcony and apartment from Booking label text", () => {
    const out = inferHotelAmenities({
      name: "Phi Phi Garden Apartment",
      typeId: 201,
      label: "Apartment in Phi Phi Islands. Breakfast included. Balcony and pool.",
    });
    expect(out.kind).toBe("apartment");
    expect(out.amenities.breakfast).toBe(true);
    expect(out.amenities.balcony).toBe(true);
    expect(out.amenities.pool).toBe(true);
    expect(out.amenities.allInclusive).toBe(false);
  });
});

describe("bookingNfltFor", () => {
  it("builds Booking search filter tokens", () => {
    expect(
      bookingNfltFor({ breakfast: true, hotel: true, balcony: true }),
    ).toEqual(["ht_id=204", "mealplan=1", "roomfacility=17"]);
  });

  it("maps cabin and jacuzzi to Booking property / facility tokens", () => {
    expect(bookingNfltFor({ cabin: true, jacuzzi: true })).toEqual([
      "ht_id=208",
      "ht_id=223",
      "ht_id=228",
      "hotelfacility=46",
    ]);
  });

  it("maps All inclusive and other popular filters to RapidAPI categories_filter", () => {
    expect(bookingCategoriesFilterFor({ allInclusive: true, breakfast: true, freeCancel: true })).toBe(
      "mealplan::1,mealplan::9,free_cancellation::1",
    );
  });
});
