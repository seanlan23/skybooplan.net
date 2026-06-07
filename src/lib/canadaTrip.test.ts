import { describe, expect, it } from "vitest";
import { filterInvalidRegionHighlights } from "@/lib/tripGeo";
import { applyCanadaBudgetFloor } from "@/lib/tripBudget";
import { isEveningDeparture } from "@/lib/flightScheduling";
import { sanitizeDestinationText } from "@/lib/textSanitize";
import type { TripRegion } from "@/lib/aiPlan.functions";

describe("Canada Niagara US filter", () => {
  it("removes Maid of the Mist from Niagara region", () => {
    const region: TripRegion = {
      city: "Niagara Falls",
      startDay: 5,
      endDay: 6,
      summary: "",
      lat: 43.096,
      lng: -79.037,
      highlights: [
        { day: 5, name: "Maid of the Mist", description: "boat", visitDuration: "2h" },
        { day: 6, name: "Hornblower Niagara City Cruises", description: "boat", visitDuration: "2h" },
      ],
    };
    const filtered = filterInvalidRegionHighlights(region);
    expect(filtered.map((h) => h.name)).toEqual(["Hornblower Niagara City Cruises"]);
  });
});

describe("applyCanadaBudgetFloor", () => {
  it("raises unrealistically low Banff day budget", () => {
    const floor = applyCanadaBudgetFloor(35, "sightseeing", undefined, "Banff", "CA");
    expect(floor).toBeGreaterThanOrEqual(130);
  });

  it("raises cross-country travel day budget", () => {
    const floor = applyCanadaBudgetFloor(40, "cross-country-travel", undefined, "Banff", "CA");
    expect(floor).toBeGreaterThanOrEqual(150);
  });
});

describe("isEveningDeparture", () => {
  it("treats 20:00 return as evening departure", () => {
    expect(
      isEveningDeparture({
        outboundDepart: "10:00",
        outboundArrive: "14:00",
        outboundArriveDayOffset: 0,
        inboundDepart: "20:00",
      }),
    ).toBe(true);
  });
});

describe("sanitizeDestinationText", () => {
  it("replaces Maid of the Mist and strips Grab for Canada", () => {
    const out = sanitizeDestinationText("Zvečer z Grabom na Maid of the Mist", "CA");
    expect(out).toContain("Hornblower");
    expect(out).not.toMatch(/Grab/i);
    expect(out).toContain("Uber");
  });
});
