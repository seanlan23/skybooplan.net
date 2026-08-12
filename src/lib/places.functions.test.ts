import { describe, expect, it } from "vitest";
import { rankWesternBalkansPlaces } from "@/lib/placesBalkan";

describe("rankWesternBalkansPlaces", () => {
  it("drops Turkmenistan when the query is Balkan", () => {
    const out = rankWesternBalkansPlaces("Balkan", [
      {
        iata: "region.tm",
        name: "Balkan",
        city: "Balkan Province",
        country: "TM",
        type: "city",
      },
    ]);
    expect(out.some((s) => s.country === "TM")).toBe(false);
    expect(out[0]?.name).toBe("Balkan");
    expect(out[0]?.country).toBe("");
  });
});
