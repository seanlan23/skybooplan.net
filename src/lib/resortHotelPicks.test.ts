import { describe, expect, it } from "vitest";
import {
  guestScoreOnTen,
  mealPlanFromHotel,
  mergeResortHotelPools,
  meetsMinGuestScore,
  pickResortHotels,
  type ResortHotelPickInput,
} from "@/lib/resortHotelPicks";

function hotel(
  over: Partial<ResortHotelPickInput> & Pick<ResortHotelPickInput, "id" | "name" | "price">,
): ResortHotelPickInput {
  return {
    rating: 8.2,
    stars: 4,
    kind: "hotel",
    ...over,
  };
}

describe("guestScoreOnTen", () => {
  it("keeps 0–10 scores and folds 80-scale reviews", () => {
    expect(guestScoreOnTen(8.4)).toBe(8.4);
    expect(guestScoreOnTen(84)).toBe(8.4);
    expect(guestScoreOnTen(0)).toBe(0);
    expect(meetsMinGuestScore(8)).toBe(true);
    expect(meetsMinGuestScore(7.9)).toBe(false);
    expect(meetsMinGuestScore(80)).toBe(true);
    expect(meetsMinGuestScore(79)).toBe(false);
  });
});

describe("mealPlanFromHotel", () => {
  it("uses live amenity flags, never invents all-inclusive", () => {
    expect(mealPlanFromHotel({ name: "Garden Hotel", amenities: { allInclusive: true } })).toBe(
      "all_inclusive",
    );
    expect(mealPlanFromHotel({ name: "Garden Hotel" })).toBe("breakfast");
  });
});

describe("mergeResortHotelPools", () => {
  it("dedupes by id and keeps an all-inclusive flag from either pool", () => {
    const merged = mergeResortHotelPools(
      [hotel({ id: "a", name: "Palm", price: 900, rating: 8.1 })],
      [hotel({ id: "a", name: "Palm", price: 910, rating: 8.6, amenities: { allInclusive: true } })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.amenities?.allInclusive).toBe(true);
    expect(merged[0]?.rating).toBe(8.6);
  });
});

describe("pickResortHotels", () => {
  it("returns up to 6 scored hotels with two all-inclusive slots", () => {
    const offers = pickResortHotels([
      hotel({ id: "low", name: "Skip Me", price: 400, rating: 7.4 }),
      hotel({
        id: "a",
        name: "Value Bay",
        price: 820,
        rating: 8.1,
        reviewWord: "Very good",
        image: "https://cf.bstatic.com/value-1.jpg",
        images: [
          "https://cf.bstatic.com/value-1.jpg",
          "https://cf.bstatic.com/value-2.jpg",
          "https://cf.bstatic.com/value-3.jpg",
        ],
      }),
      hotel({
        id: "b",
        name: "Mid Reef",
        price: 1240,
        rating: 9.2,
        reviewWord: "Superb",
        amenities: { breakfast: true },
      }),
      hotel({
        id: "c",
        name: "Palm All Inclusive",
        price: 1600,
        rating: 8.8,
        amenities: { allInclusive: true },
      }),
      hotel({
        id: "d",
        name: "Coral All Inclusive",
        price: 2100,
        rating: 9.1,
        amenities: { allInclusive: true },
      }),
      hotel({ id: "e", name: "Boutique Beach House", price: 1400, rating: 8.7, neighborhood: "Beach" }),
      hotel({ id: "f", name: "Royal Palace", price: 3200, rating: 9.0, stars: 5 }),
      hotel({ id: "g", name: "Garden Inn", price: 1100, rating: 8.3 }),
    ]);
    expect(offers.length).toBe(6);
    expect(new Set(offers.map((o) => o.id)).size).toBe(6);
    expect(offers.some((o) => o.id === "low")).toBe(false);
    expect(offers.filter((o) => o.mealPlan === "all_inclusive").length).toBeGreaterThanOrEqual(2);
    expect(offers.map((o) => o.tier)).toContain("value");
    expect(offers.map((o) => o.tier)).toContain("recommended");
    expect(offers.map((o) => o.tier)).toContain("all_inclusive");
    expect(offers.map((o) => o.tier)).toContain("all_inclusive_alt");
    expect(offers.map((o) => o.tier)).toContain("boutique");
    expect(offers.map((o) => o.tier)).toContain("premium");
    expect(offers.find((o) => o.tier === "premium")?.name).toBe("Royal Palace");
    expect(offers.find((o) => o.tier === "boutique")?.name).toBe("Boutique Beach House");
    expect(offers.every((o) => (o.guestScore ?? 0) >= 8)).toBe(true);
    expect(offers.find((o) => o.id === "a")?.images).toEqual([
      "https://cf.bstatic.com/value-1.jpg",
      "https://cf.bstatic.com/value-2.jpg",
      "https://cf.bstatic.com/value-3.jpg",
    ]);
  });

  it("drops hotels without a guest score or below 8.0", () => {
    expect(pickResortHotels([hotel({ id: "x", name: "No Score Inn", price: 500, rating: 0 })])).toEqual(
      [],
    );
    expect(
      pickResortHotels([
        hotel({ id: "z", name: "  ", price: 900 }),
        hotel({ id: "y", name: "Ok", price: 0, rating: 8.5 }),
        hotel({ id: "w", name: "Low", price: 700, rating: 7.2 }),
      ]),
    ).toEqual([]);
  });

  it("does not reserve all-inclusive slots when the region is breakfast-first", () => {
    const offers = pickResortHotels(
      [
        hotel({ id: "a", name: "Value Bay", price: 820, rating: 8.1 }),
        hotel({
          id: "c",
          name: "Palm All Inclusive",
          price: 1600,
          rating: 8.8,
          amenities: { allInclusive: true },
        }),
        hotel({ id: "e", name: "Boutique Beach House", price: 1400, rating: 8.7 }),
      ],
      { preferAllInclusiveSlots: false },
    );
    expect(offers.some((o) => o.tier === "all_inclusive")).toBe(false);
    expect(offers.some((o) => o.tier === "value")).toBe(true);
  });

  it("does not invent a second all-inclusive when Booking only sent one", () => {
    const offers = pickResortHotels([
      hotel({ id: "a", name: "Value Bay", price: 820, rating: 8.2 }),
      hotel({
        id: "c",
        name: "Palm All Inclusive",
        price: 2100,
        rating: 9.1,
        amenities: { allInclusive: true },
      }),
    ]);
    expect(offers.filter((o) => o.mealPlan === "all_inclusive")).toHaveLength(1);
    expect(offers[0]?.guestScore).toBe(8.2);
  });

  it("keeps breakfast meal-plan hotels but drops hostels, 2★ and apartments", () => {
    const offers = pickResortHotels([
      hotel({
        id: "keep",
        name: "Garden Hotel",
        price: 1100,
        rating: 8.4,
        amenities: { breakfast: true },
      }),
      hotel({ id: "hostel", name: "Beach Hostel", price: 400, rating: 8.6 }),
      hotel({ id: "two", name: "Budget Hotel", price: 500, rating: 8.3, stars: 2 }),
      hotel({ id: "none", name: "Unrated Hotel", price: 700, rating: 8.5, stars: undefined }),
      hotel({
        id: "apt",
        name: "Sea View Apartment",
        price: 800,
        rating: 8.7,
        kind: "apartment",
        typeName: "Apartment",
      }),
      hotel({
        id: "villa",
        name: "Palm Villa",
        price: 1400,
        rating: 8.8,
        kind: "apartment",
        typeName: "Villa",
      }),
    ]);
    expect(offers.map((o) => o.id).sort()).toEqual(["keep", "villa"]);
    expect(offers.every((o) => (o.guestScore ?? 0) >= 8)).toBe(true);
  });

  it("for Maldives keeps 4★ island value cards and drops Male / Hulhumale", () => {
    const offers = pickResortHotels(
      [
        hotel({
          id: "male",
          name: "City Hotel Male",
          price: 900,
          stars: 4,
          neighborhood: "Malé",
        }),
        hotel({
          id: "hulhu",
          name: "Hulhumale Beach Hotel",
          price: 950,
          stars: 4,
          neighborhood: "Hulhumalé",
        }),
        hotel({
          id: "bandos",
          name: "Bandos Maldives",
          price: 2000,
          stars: 4,
          neighborhood: "North Male Atoll",
        }),
        hotel({
          id: "fiha",
          name: "Fihalhohi Island Resort",
          price: 1800,
          stars: 4,
          neighborhood: "South Male Atoll",
        }),
        hotel({
          id: "adaaran",
          name: "Adaaran Club Rannalhi",
          price: 2400,
          stars: 4,
          amenities: { allInclusive: true },
          neighborhood: "South Male Atoll",
        }),
        hotel({
          id: "ai2",
          name: "Reef All Inclusive",
          price: 3200,
          stars: 5,
          amenities: { allInclusive: true },
        }),
        hotel({
          id: "hyatt",
          name: "Park Hyatt Maldives",
          price: 9000,
          stars: 5,
        }),
        hotel({
          id: "over",
          name: "Lagoon Overwater Villa",
          price: 8500,
          stars: 5,
        }),
      ],
      { destIata: "MLE", nights: 10, preferAllInclusiveSlots: true },
    );

    expect(offers.some((o) => o.id === "male" || o.id === "hulhu")).toBe(false);
    expect(offers.filter((o) => o.tier === "value" || o.tier === "recommended")).toHaveLength(2);
    expect(offers.filter((o) => o.tier === "value" || o.tier === "recommended").map((o) => o.id).sort()).toEqual([
      "bandos",
      "fiha",
    ]);
    expect(offers.filter((o) => o.tier === "all_inclusive" || o.tier === "all_inclusive_alt")).toHaveLength(2);
    expect(offers.filter((o) => o.tier === "premium").map((o) => o.id).sort()).toEqual(["hyatt", "over"]);
    expect(offers.find((o) => o.tier === "value")?.name).not.toMatch(/hyatt|ritz/i);
  });
});
