import { describe, expect, it } from "vitest";
import {
  buildAppleMapsRoadTripUrl,
  buildGoogleMapsRoadTripUrl,
} from "@/lib/navigationService";
import {
  buildHeroMotorhomeSearchQuery,
  motorhomePlannerFromCollected,
} from "@/lib/heroMotorhome";

describe("motorhomePlannerFromCollected", () => {
  it("sets motorhome ground trip from Vienna to Amsterdam", () => {
    const { ctx, form } = motorhomePlannerFromCollected(
      {
        destination: "Amsterdam",
        dates: "1. avg → 14. avg 2026",
        nights: "",
        origin: "Vienna",
        passengers: "2 odrasli",
        pace: "",
        budget: "",
        priorities: ["beaches", "nature"],
      },
      "sl",
    );
    expect(ctx.groundTransportMode).toBe("motorhome");
    expect(ctx.originPlace).toBe("Vienna");
    expect(ctx.destinationPlace).toBe("Amsterdam");
    expect(ctx.departDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(form.wishes).toMatch(/AVTODOMOM|avtodom/i);
    expect(form.wishes).toMatch(/Prioritete/i);
    expect(form.tags).toEqual(["beaches", "nature"]);
  });
});

describe("buildHeroMotorhomeSearchQuery", () => {
  it("mentions motorhome and endpoints", () => {
    const q = buildHeroMotorhomeSearchQuery({
      destination: "Albania",
      dates: "julij",
      nights: "",
      origin: "Vienna",
      passengers: "2 odrasli",
      pace: "",
      budget: "",
      priorities: ["mountains", "nature"],
    });
    expect(q).toMatch(/Motorhome/i);
    expect(q).toMatch(/Vienna/);
    expect(q).toMatch(/Albania/);
    expect(q).toMatch(/priorities/i);
  });
});

describe("buildGoogleMapsRoadTripUrl", () => {
  it("builds multi-stop dir URL", () => {
    const url = buildGoogleMapsRoadTripUrl(["Vienna", "Munich", "Amsterdam"]);
    expect(url).toContain("google.com/maps/dir/");
    expect(url).toContain("Vienna");
    expect(url).toContain("Amsterdam");
  });
});

describe("buildAppleMapsRoadTripUrl", () => {
  it("supports multi-stop via to: waypoints", () => {
    const url = buildAppleMapsRoadTripUrl(["Vienna", "Munich", "Ljubljana", "Split"]);
    expect(url).toContain("maps.apple.com");
    expect(url).toContain("saddr=Vienna");
    expect(decodeURIComponent(url)).toMatch(/to:Ljubljana|to%3ALjubljana/i);
  });

  it("keeps two-arg origin/destination form", () => {
    const url = buildAppleMapsRoadTripUrl("Vienna", "Amsterdam");
    expect(url).toContain("saddr=Vienna");
    expect(url).toContain("daddr=Amsterdam");
  });
});
