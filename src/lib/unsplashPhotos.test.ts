import { describe, expect, it } from "vitest";
import { buildUnsplashSearchQueries } from "@/lib/unsplashPhotos";

describe("buildUnsplashSearchQueries", () => {
  it("orders poi+city before city travel and city alone", () => {
    expect(buildUnsplashSearchQueries("Grand Palace", "Bangkok")).toEqual([
      "Grand Palace Bangkok",
      "Bangkok travel",
      "Bangkok",
    ]);
  });

  it("falls back to city-only when poi is empty", () => {
    expect(buildUnsplashSearchQueries("", "Colombo")).toEqual(["Colombo travel", "Colombo"]);
  });

  it("dedupes identical queries", () => {
    expect(buildUnsplashSearchQueries("Rome", "Rome")).toEqual(["Rome Rome", "Rome travel", "Rome"]);
  });
});
