import { describe, expect, it } from "vitest";
import {
  bookingCategoriesFilterFor,
  bookingNfltFor,
  inferHotelAmenities,
  inferHotelKind,
  isAllowedResortStayProperty,
} from "./hotelAmenities";

describe("inferHotelKind", () => {
  it("maps Booking type ids", () => {
    expect(inferHotelKind(204)).toBe("hotel");
    expect(inferHotelKind(216)).toBe("hotel");
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

  it("forwards the 8.0+ guest-score filter to Booking nflt and RapidAPI", () => {
    expect(bookingNfltFor({ minReview80: true })).toEqual(["review_score=80"]);
    expect(bookingCategoriesFilterFor({ minReview80: true })).toBe("review_score::80");
  });

  it("forwards 3–5★ and hotel/resort/villa types for Resort / Mir", () => {
    expect(bookingNfltFor({ resortStay: true, stars345: true })).toEqual([
      "ht_id=204",
      "ht_id=216",
      "ht_id=213",
      "class=3",
      "class=4",
      "class=5",
      "class_interval=3,4,5",
    ]);
    expect(bookingCategoriesFilterFor({ resortStay: true, stars345: true })).toBe(
      "ht_id::204,ht_id::216,ht_id::213,class::3,class::4,class::5,class_interval::3",
    );
  });

  it("forwards 4–5★ when the stay mix raises the star floor", () => {
    expect(bookingNfltFor({ resortStay: true, stars45: true })).toEqual([
      "ht_id=204",
      "ht_id=216",
      "ht_id=213",
      "class=4",
      "class=5",
      "class_interval=4,5",
    ]);
    expect(bookingCategoriesFilterFor({ resortStay: true, stars45: true })).toBe(
      "ht_id::204,ht_id::216,ht_id::213,class::4,class::5,class_interval::4",
    );
  });
});

describe("isAllowedResortStayProperty", () => {
  it("keeps official 3–5★ hotels, resorts, boutique hotels and villas", () => {
    expect(isAllowedResortStayProperty({ name: "Palm Hotel", kind: "hotel", stars: 3 })).toBe(true);
    expect(
      isAllowedResortStayProperty({ name: "Island Three Star", kind: "hotel", stars: 3, minStars: 4 }),
    ).toBe(false);
    expect(
      isAllowedResortStayProperty({ name: "Coral Four Star", kind: "hotel", stars: 4, minStars: 4 }),
    ).toBe(true);
    expect(isAllowedResortStayProperty({ name: "Coral Resort", kind: "other", stars: 4 })).toBe(true);
    expect(isAllowedResortStayProperty({ name: "Boutique Beach House", kind: "hotel", stars: 4 })).toBe(
      true,
    );
    expect(
      isAllowedResortStayProperty({
        name: "Sunset Villa",
        typeName: "Villa",
        kind: "apartment",
        stars: 5,
      }),
    ).toBe(true);
  });

  it("drops unrated, 1–2★ and hostel / apartment / homestay types", () => {
    expect(isAllowedResortStayProperty({ name: "Palm Hotel", kind: "hotel" })).toBe(false);
    expect(
      isAllowedResortStayProperty({ name: "Palm Hotel", kind: "hotel", allowUnrated: true }),
    ).toBe(true);
    expect(isAllowedResortStayProperty({ name: "Palm Hotel", kind: "hotel", stars: 2 })).toBe(false);
    expect(isAllowedResortStayProperty({ name: "Beach Hostel", kind: "hotel", stars: 4 })).toBe(false);
    expect(isAllowedResortStayProperty({ name: "Mom's Home", kind: "other", stars: 4 })).toBe(false);
    expect(
      isAllowedResortStayProperty({
        name: "Sea View Apartment",
        typeName: "Apartment",
        kind: "apartment",
        stars: 4,
      }),
    ).toBe(false);
    expect(isAllowedResortStayProperty({ name: "Garden Guest House", kind: "hotel", stars: 3 })).toBe(
      false,
    );
    expect(isAllowedResortStayProperty({ name: "City Condo", kind: "hotel", stars: 4 })).toBe(false);
    expect(isAllowedResortStayProperty({ name: "Hill Mansion", kind: "hotel", stars: 4 })).toBe(false);
    expect(isAllowedResortStayProperty({ name: "Backpacker Dormitory", kind: "other", stars: 3 })).toBe(
      false,
    );
    expect(isAllowedResortStayProperty({ name: "Rose Bed and Breakfast", kind: "hotel", stars: 3 })).toBe(
      false,
    );
    expect(isAllowedResortStayProperty({ name: "Family Homestay", kind: "other", stars: 3 })).toBe(false);
    expect(isAllowedResortStayProperty({ name: "Garden Hotel", kind: "hotel", stars: 4, typeId: 214 })).toBe(
      false,
    );
    expect(
      isAllowedResortStayProperty({ name: "Harmony Stan na Dan", kind: "other", stars: 4 }),
    ).toBe(false);
    expect(
      isAllowedResortStayProperty({ name: "Apartman Mihajlovic", kind: "other", stars: 4 }),
    ).toBe(false);
  });
});
