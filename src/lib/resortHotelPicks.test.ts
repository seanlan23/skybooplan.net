import { describe, expect, it } from "vitest";
import {
  guestScoreOnTen,
  mealPlanFromHotel,
  mergeResortHotelPools,
  meetsMinGuestScore,
  pickResortHotels,
  valueForMoneyScore,
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

describe("valueForMoneyScore", () => {
  it("ranks guest score per euro of stay total, not cheapest-first", () => {
    expect(valueForMoneyScore({ rating: 8.8, price: 1000 })).toBeCloseTo(0.0088);
    expect(valueForMoneyScore({ rating: 81, price: 1000 })).toBeCloseTo(0.0081);
    const cheapUnknown = { rating: 8.0, price: 400 };
    const betterResort = { rating: 9.2, price: 900 };
    expect(valueForMoneyScore(cheapUnknown)).toBeGreaterThan(valueForMoneyScore(betterResort));
    expect(valueForMoneyScore({ rating: 8.1, price: 0 })).toBe(0);
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
        amenities: { breakfast: true, pool: true },
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
      hotel({
        id: "e",
        name: "Boutique Beach House",
        price: 1400,
        rating: 8.7,
        neighborhood: "Beach",
        locationScore: 9.1,
      }),
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
    expect(offers.find((o) => o.tier === "value")?.id).toBe("a");
    expect(offers.find((o) => o.tier === "recommended")?.id).toBe("b");
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
    expect(offers.map((o) => o.id).sort()).toEqual(["keep", "none", "villa"]);
    expect(offers.some((o) => o.id === "hostel" || o.id === "two" || o.id === "apt")).toBe(false);
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
          id: "three",
          name: "Budget Island Three Star",
          price: 1100,
          stars: 3,
          neighborhood: "North Male Atoll",
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

    expect(offers.some((o) => o.id === "male" || o.id === "hulhu" || o.id === "three")).toBe(false);
    expect(offers.filter((o) => o.tier === "value" || o.tier === "recommended")).toHaveLength(2);
    expect(offers.find((o) => o.tier === "value")?.id).toBe("fiha");
    expect(offers.filter((o) => o.tier === "value" || o.tier === "recommended").map((o) => o.id).sort()).toEqual([
      "bandos",
      "fiha",
    ]);
    expect(offers.filter((o) => o.tier === "all_inclusive" || o.tier === "all_inclusive_alt")).toHaveLength(2);
    expect(offers.filter((o) => o.tier === "premium").map((o) => o.id)).toEqual(["over"]);
    expect(offers.find((o) => o.tier === "value")?.name).not.toMatch(/hyatt|ritz/i);
  });

  it("respects the 1000–2000€ package cap and fills 4–6 cards from 3★/4★", () => {
    const offers = pickResortHotels(
      [
        hotel({
          id: "ultra1",
          name: "Park Hyatt Maldives",
          price: 9000,
          stars: 5,
          rating: 9.4,
        }),
        hotel({
          id: "ultra2",
          name: "Radisson Blu Resort Maldives with 50 percent off on Sea Plane round trip 03 nights & above",
          price: 8500,
          stars: 5,
          rating: 9.1,
        }),
        hotel({ id: "v3", name: "Island Four Star Resort", price: 1400, stars: 4, rating: 8.1 }),
        hotel({ id: "v4", name: "Coral Four Star", price: 1550, stars: 4, rating: 8.3 }),
        hotel({
          id: "ai1",
          name: "Reef All Inclusive",
          price: 1750,
          stars: 4,
          amenities: { allInclusive: true },
        }),
        hotel({
          id: "ai2",
          name: "Palm All Inclusive",
          price: 1850,
          stars: 4,
          amenities: { allInclusive: true },
        }),
        hotel({ id: "mid", name: "Lagoon Hotel", price: 1680, stars: 4, rating: 8.5 }),
        hotel({ id: "mid2", name: "Atoll Hotel", price: 1720, stars: 4, rating: 8.2 }),
      ],
      {
        destIata: "MLE",
        nights: 10,
        preferAllInclusiveSlots: true,
        flightTotalEur: 2242,
        guests: 2,
        budgetMaxPerPerson: 2000,
      },
    );

    expect(offers.length).toBeGreaterThanOrEqual(4);
    expect(offers.length).toBeLessThanOrEqual(6);
    expect(
      offers.every((offer) => (2242 + offer.hotelEur) / 2 <= 2200),
    ).toBe(true);
    expect(offers.some((offer) => /hyatt|radisson/i.test(offer.name))).toBe(false);
    expect(offers.find((offer) => offer.id === "ultra2")?.name).toBeUndefined();
    expect(offers.filter((o) => o.tier === "value" || o.tier === "recommended")).toHaveLength(2);
    expect(offers.filter((o) => o.tier === "all_inclusive" || o.tier === "all_inclusive_alt")).toHaveLength(
      2,
    );
    expect(offers.find((o) => o.id === "v3")?.name).toBe("Island Four Star Resort");
  });

  it("drops the package budget cap when it would leave fewer than 4 live hotels", () => {
    const offers = pickResortHotels(
      [
        hotel({ id: "a", name: "Bavaro Palace", price: 2400, rating: 8.6 }),
        hotel({
          id: "b",
          name: "Coral All Inclusive",
          price: 2600,
          rating: 8.8,
          amenities: { allInclusive: true },
        }),
        hotel({ id: "c", name: "Palm Beach Resort", price: 2800, rating: 8.4, amenities: { pool: true } }),
        hotel({ id: "d", name: "Ocean Garden Hotel", price: 3000, rating: 8.3 }),
        hotel({
          id: "e",
          name: "Sunset Club",
          price: 3200,
          rating: 8.2,
          amenities: { allInclusive: true },
        }),
      ],
      {
        destIata: "PUJ",
        flightTotalEur: 1726,
        guests: 2,
        budgetMaxPerPerson: 1200,
      },
    );
    expect(offers).toHaveLength(5);
    expect(offers.every((offer) => offer.name && !/punta cana/i.test(offer.name))).toBe(true);
  });

  it("keeps unrated 8.0+ hotels only when rated rows are too few", () => {
    const offers = pickResortHotels([
      hotel({ id: "rated", name: "Rated Bay Hotel", price: 1400, stars: 4, rating: 8.4 }),
      hotel({ id: "u1", name: "Unrated Palm Hotel", price: 1500, stars: undefined, rating: 8.5 }),
      hotel({ id: "u2", name: "Unrated Coral Hotel", price: 1600, stars: undefined, rating: 8.3 }),
      hotel({ id: "u3", name: "Unrated Ocean Hotel", price: 1700, stars: undefined, rating: 8.2 }),
    ]);
    expect(offers.map((o) => o.id)).toEqual(expect.arrayContaining(["rated", "u1", "u2", "u3"]));
  });

  it("gives Ugodna izbira to the best score-per-euro 3★/4★, not a cheaper 5★", () => {
    const offers = pickResortHotels([
      hotel({ id: "star5", name: "Cheap Palace", price: 700, stars: 5, rating: 8.1 }),
      hotel({ id: "vfm", name: "Coral Garden Resort", price: 1100, stars: 4, rating: 9.0 }),
      hotel({ id: "ok", name: "Bay Hotel", price: 1300, stars: 3, rating: 8.6, amenities: { pool: true } }),
    ]);
    expect(offers.find((o) => o.tier === "value")?.id).toBe("vfm");
    expect(offers.find((o) => o.tier === "recommended")?.id).toBe("ok");
    expect(offers.find((o) => o.tier === "premium")?.id).toBe("star5");
  });

  it("cleans marketing tails on card titles", () => {
    const offers = pickResortHotels([
      hotel({
        id: "rad",
        name: "Radisson Blu Resort Maldives with 50 percent off on Sea Plane round trip 03 nights & above",
        price: 1400,
        stars: 4,
        rating: 8.4,
      }),
    ]);
    expect(offers[0]?.name).toBe("Radisson Blu Resort Maldives");
  });

  it("prefers HKT beach belts over Phuket Town", () => {
    const offers = pickResortHotels(
      [
        hotel({
          id: "town",
          name: "Sino House Phuket",
          neighborhood: "Phuket Town",
          price: 480,
          rating: 8.6,
        }),
        hotel({
          id: "inland",
          name: "Kathu Inn",
          neighborhood: "Kathu",
          price: 510,
          rating: 8.3,
        }),
        hotel({
          id: "kata",
          name: "Kata Palm Resort",
          neighborhood: "Kata Beach",
          price: 920,
          rating: 8.5,
          amenities: { pool: true },
        }),
        hotel({
          id: "bang",
          name: "Bang Tao Bay Hotel",
          neighborhood: "Bang Tao",
          price: 1100,
          rating: 8.7,
          amenities: { pool: true },
        }),
      ],
      { destIata: "HKT" },
    );
    expect(offers.some((o) => o.id === "town")).toBe(false);
    expect(offers.map((o) => o.id)).toEqual(expect.arrayContaining(["kata", "bang"]));
    expect(offers.find((o) => o.tier === "value")?.id).toBe("kata");
  });
});
