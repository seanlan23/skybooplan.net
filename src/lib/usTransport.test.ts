import { describe, expect, it } from "vitest";
import { filterDepartureDayHighlights, isMorningOnlyPoi } from "@/lib/tripContent";
import { motorhomeTransportBetween } from "@/lib/tripMode";

describe("US motorhome transport", () => {
  it("St Louis → Oklahoma City is multi-hour drive not local", () => {
    const t = motorhomeTransportBetween(800, "St. Louis", "Oklahoma City");
    expect(t.type).toBe("drive");
    expect(t.duration).toMatch(/8|9|10|11/);
    expect(t.howTo).toContain("800");
  });
});

describe("Sunset Crater scheduling", () => {
  it("is morning-only POI", () => {
    expect(
      isMorningOnlyPoi(
        "Sunset Crater Volcano",
        "Priporočljivo je obiskati v zgodnjih jutranjih urah",
      ),
    ).toBe(true);
  });
});

describe("LAX departure day", () => {
  it("strips Griffith Observatory before afternoon flight", () => {
    const out = filterDepartureDayHighlights(
      [
        {
          day: 21,
          name: "Griffith Observatory",
          description: "Views",
          visitDuration: "2h",
        },
        {
          day: 21,
          name: "LAX area lunch",
          description: "Near airport",
          visitDuration: "1h",
        },
      ],
      "LAX",
      "17:20",
    );
    expect(out.map((h) => h.name)).toEqual(["LAX area lunch"]);
  });
});
