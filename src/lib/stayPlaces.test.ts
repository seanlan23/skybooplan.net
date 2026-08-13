import { describe, expect, it } from "vitest";
import {
  formatStayPlacePick,
  mergeStaySuggestions,
  searchStayPlaces,
} from "@/lib/stayPlaces";

describe("searchStayPlaces", () => {
  it("returns Ko Phi Phi Don for phi phi don — never airports", () => {
    const hits = searchStayPlaces("phi phi don");
    expect(hits.map((h) => h.name)).toContain("Ko Phi Phi Don");
    expect(hits.every((h) => h.type === "city")).toBe(true);
    expect(hits.every((h) => !/^[A-Z]{3}$/.test(h.iata))).toBe(true);
  });

  it("matches a partial island query", () => {
    expect(searchStayPlaces("phi phi")[0]?.name).toBe("Ko Phi Phi Don");
  });
});

describe("mergeStaySuggestions", () => {
  it("keeps Mapbox places and does not require IATA codes", () => {
    const merged = mergeStaySuggestions("phi phi don", [
      {
        iata: "place.123",
        name: "Ko Phi Phi Don",
        city: "Krabi",
        country: "TH",
        type: "city",
      },
    ]);
    expect(merged[0]?.name).toBe("Ko Phi Phi Don");
    expect(merged).toHaveLength(1);
  });
});

describe("formatStayPlacePick", () => {
  it("passes the place name through for Booking", () => {
    expect(
      formatStayPlacePick({
        iata: "stay.Ko Phi Phi Don",
        name: "Ko Phi Phi Don",
        city: "Krabi",
        country: "TH",
        type: "city",
      }),
    ).toEqual({ value: "Ko Phi Phi Don", label: "Ko Phi Phi Don" });
  });
});
