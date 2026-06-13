import { describe, it, expect } from "vitest";
import { progressAlongRoute, resolveSegmentCoordsForDay } from "@/lib/tripMapProgressiveDraw";
import type { TripRouteSegment } from "@/lib/tripMapRoutes";

describe("tripMapProgressiveDraw", () => {
  it("progressAlongRoute returns 0 at start and 1 at end", () => {
    const line: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    expect(progressAlongRoute(line, [0, 0])).toBe(0);
    expect(progressAlongRoute(line, [2, 0])).toBe(1);
  });

  it("resolveSegmentCoordsForDay prefers Directions segment", () => {
    const route: TripRouteSegment[] = [
      {
        id: "a",
        mode: "driving",
        from: [12, 45],
        to: [13, 46],
        coordinates: [
          [12, 45],
          [12.5, 45.5],
          [13, 46],
        ],
        dayTo: 2,
        durationSeconds: 3600,
        durationLabel: "1h",
      },
    ];
    const coords = resolveSegmentCoordsForDay(route, 2, new Map(), null, []);
    expect(coords).toHaveLength(3);
    expect(coords[0]).toEqual([12, 45]);
  });
});
