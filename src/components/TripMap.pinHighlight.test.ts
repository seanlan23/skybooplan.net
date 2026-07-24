import { describe, expect, it } from "vitest";
import { pinIsHighlighted, pinMatchesHighlight } from "@/components/TripMap";

describe("pinMatchesHighlight", () => {
  it("matches exact and truncated activity titles", () => {
    expect(
      pinMatchesHighlight("Večerna zabava v Roppongiju", "Večerna zabava v Roppongiju"),
    ).toBe(true);
    expect(
      pinMatchesHighlight("Večerna zabava v Roppongiju", "Večerna zabava v Ropp"),
    ).toBe(true);
  });

  it("matches German activity title to short English pin (day 3+ case)", () => {
    expect(
      pinMatchesHighlight("Brooklyn Bridge", "Spaziergang über die Brooklyn Bridge"),
    ).toBe(true);
    expect(
      pinMatchesHighlight(
        "Spaziergang über die Brooklyn Bridge",
        "Brooklyn Bridge",
      ),
    ).toBe(true);
  });

  it("does not match unrelated pins", () => {
    expect(pinMatchesHighlight("Meiji Jingu", "Večerna zabava v Roppongiju")).toBe(false);
    expect(
      pinMatchesHighlight("Neighbourhood dinner", "Spaziergang über die Brooklyn Bridge"),
    ).toBe(false);
  });
});

describe("pinIsHighlighted", () => {
  it("matches by nearby coordinates with weak token overlap", () => {
    expect(
      pinIsHighlighted(
        { name: "Brooklyn Bridge", lat: 40.7061, lng: -73.9969 },
        {
          name: "Spaziergang über die Brooklyn Bridge",
          lat: 40.7062,
          lng: -73.997,
        },
      ),
    ).toBe(true);
  });
});
