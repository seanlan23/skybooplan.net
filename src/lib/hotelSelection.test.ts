import { describe, it, expect } from "vitest";
import {
  selectHotelSource,
  shouldUseFallback,
  type QueryState,
  type HotelLike,
} from "./hotelSelection";

const success = <T,>(hotels: T[]): QueryState<T> => ({
  isLoading: false,
  isError: false,
  isSuccess: true,
  data: { hotels },
});
const loading: QueryState<HotelLike> = {
  isLoading: true,
  isError: false,
  isSuccess: false,
};
const idle: QueryState<HotelLike> = {
  isLoading: false,
  isError: false,
  isSuccess: false,
};
const errored: QueryState<HotelLike> = {
  isLoading: false,
  isError: true,
  isSuccess: false,
};

const realHotel: HotelLike = { id: "1", name: "Hotel Real" };

describe("shouldUseFallback", () => {
  it("waits for the primary query before deciding", () => {
    expect(shouldUseFallback(loading, "Siquijor", "Philippines")).toBe(false);
    expect(shouldUseFallback(idle, "Siquijor", "Philippines")).toBe(false);
  });

  it("does not fall back when primary has hotels", () => {
    expect(
      shouldUseFallback(success([realHotel]), "Siquijor", "Philippines"),
    ).toBe(false);
  });

  it("triggers fallback for a sub-location with a distinct regional hub", () => {
    expect(shouldUseFallback(success([]), "Siquijor", "Philippines")).toBe(true);
  });

  it("ignores fallback when the hub equals the city (case/whitespace insensitive)", () => {
    expect(shouldUseFallback(success([]), "Manila", "manila")).toBe(false);
    expect(shouldUseFallback(success([]), " Manila ", "MANILA")).toBe(false);
  });

  it("ignores fallback when no regional hub is supplied", () => {
    expect(shouldUseFallback(success([]), "Siquijor", undefined)).toBe(false);
    expect(shouldUseFallback(success([]), "Siquijor", "")).toBe(false);
  });
});

describe("selectHotelSource", () => {
  it("renders real hotels from the primary city when available", () => {
    const result = selectHotelSource(
      success([realHotel]),
      idle,
      "Manila",
      "Philippines",
    );
    expect(result.usedFallback).toBe(false);
    expect(result.sourceCity).toBe("Manila");
    expect(result.hotels).toEqual([realHotel]);
    expect(result.showEmpty).toBe(false);
  });

  it("Siquijor with zero results falls back to the Philippines hub", () => {
    const hub: HotelLike = { id: "h1", name: "Manila Hotel" };
    const result = selectHotelSource(
      success([]),
      success([hub]),
      "Siquijor",
      "Philippines",
    );
    expect(result.usedFallback).toBe(true);
    expect(result.sourceCity).toBe("Philippines");
    expect(result.hotels).toEqual([hub]);
    expect(result.showEmpty).toBe(false);
  });

  it("never invents hotels — empty primary + empty fallback shows empty state", () => {
    const result = selectHotelSource(
      success([]),
      success([]),
      "Siquijor",
      "Philippines",
    );
    expect(result.hotels).toEqual([]);
    expect(result.showEmpty).toBe(true);
    expect(result.usedFallback).toBe(false);
  });

  it("shows empty state (not mock data) when both queries error out", () => {
    const result = selectHotelSource(
      errored,
      errored,
      "Siquijor",
      "Philippines",
    );
    expect(result.hotels).toEqual([]);
    expect(result.showEmpty).toBe(true);
    expect(result.isError).toBe(true);
  });

  it("keeps loading while the fallback is in flight", () => {
    const result = selectHotelSource(
      success([]),
      loading,
      "Siquijor",
      "Philippines",
    );
    expect(result.isLoading).toBe(true);
    expect(result.showEmpty).toBe(false);
  });

  it("does not surface (0,0) coordinate hotels — output mirrors input strictly", () => {
    // Regression guard: if a future bug ever pipes mock hotels with
    // lat/lng = 0 through this layer, the test catches it because the
    // selection helper must echo back exactly what the queries returned
    // and never synthesize entries on its own.
    const empty: HotelLike[] = [];
    const result = selectHotelSource<HotelLike>(
      success(empty),
      success(empty),
      "Siquijor",
      "Philippines",
    );
    const hasZeroIsland = result.hotels.some(
      (h) => h.lat === 0 && h.lng === 0,
    );
    expect(hasZeroIsland).toBe(false);
    expect(result.hotels.length).toBe(0);
  });

  it("does not require a fallback for a city with no regional hub", () => {
    const result = selectHotelSource(
      success([]),
      idle,
      "Reykjavik",
      undefined,
    );
    expect(result.usedFallback).toBe(false);
    expect(result.fallbackAttempted).toBe(false);
    expect(result.showEmpty).toBe(true);
    expect(result.sourceCity).toBe("Reykjavik");
  });
});
