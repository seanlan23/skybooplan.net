import { describe, expect, it } from "vitest";
import { buildGoogleMapsRoadTripUrl } from "@/lib/navigationService";
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
      },
      "sl",
    );
    expect(ctx.groundTransportMode).toBe("motorhome");
    expect(ctx.originPlace).toBe("Vienna");
    expect(ctx.destinationPlace).toBe("Amsterdam");
    expect(ctx.departDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(form.wishes).toMatch(/AVTODOMOM|avtodom/i);
  });
});

describe("buildHeroMotorhomeSearchQuery", () => {
  it("mentions avtodom and endpoints", () => {
    const q = buildHeroMotorhomeSearchQuery({
      destination: "Albania",
      dates: "julij",
      nights: "",
      origin: "Vienna",
      passengers: "2 odrasli",
      pace: "",
      budget: "",
    });
    expect(q).toMatch(/Avtodom/);
    expect(q).toMatch(/Vienna/);
    expect(q).toMatch(/Albania/);
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
