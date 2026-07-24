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

  it("matches Italian lunch+museum title to San Agustin pin", () => {
    expect(
      pinMatchesHighlight("Museo di San Agustin", "Pranzo e Museo di San Agustin"),
    ).toBe(true);
  });

  it("matches after map pin jitter (~1.2 km)", () => {
    expect(
      pinIsHighlighted(
        { name: "San Agustin Museum", lat: 14.5895, lng: 120.975 },
        {
          name: "Pranzo e Museo di San Agustin",
          lat: 14.5892,
          lng: 120.9751,
        },
      ),
    ).toBe(true);
    // ~1.3 km offset (jitter band)
    expect(
      pinIsHighlighted(
        { name: "San Agustin Museum", lat: 14.5895, lng: 120.975 },
        {
          name: "Pranzo e Museo di San Agustin",
          lat: 14.601,
          lng: 120.975,
        },
      ),
    ).toBe(true);
  });
});
