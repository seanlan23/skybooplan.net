import { describe, it, expect } from "vitest";
import {
  buildActiveDayWaypoints,
  filterBoundsNearDay,
  pickPrimarySegment,
  progressAlongRoute,
  resolveActiveDayRoute,
  resolveSegmentCoordsForDay,
  shouldDrawDrivingRoute,
  MIN_ROAD_TRIP_DRAW_KM,
  MAX_DAY_CAMERA_SPAN_KM,
} from "@/lib/tripMapProgressiveDraw";
import type { TripRouteSegment } from "@/lib/tripMapRoutes";
import type { DayPlan } from "@/lib/aiPlan.functions";

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

  it("buildActiveDayWaypoints stays on active-day POIs (no previous-city stretch)", () => {
    const dayPlan = {
      day: 2,
      mapPins: [{ name: "Temple", lat: 8.1, lng: 98.3 }],
    } as unknown as DayPlan;
    const dayCoords = new Map<number, [number, number]>([
      [1, [11.5, 48.1]], // Munich
      [2, [98.5, 8.2]], // Phuket
    ]);
    const waypoints = buildActiveDayWaypoints(2, dayPlan, dayCoords, [11.5, 48.1], []);
    expect(waypoints.some((c) => c[0] === 98.3 && c[1] === 8.1)).toBe(true);
    expect(waypoints.some((c) => c[0] === 11.5 && c[1] === 48.1)).toBe(false);
  });

  it("filterBoundsNearDay drops intercontinental origin from camera bounds", () => {
    const phuket: [number, number] = [98.3, 7.9];
    const munich: [number, number] = [11.5, 48.1];
    const local = filterBoundsNearDay(phuket, [[phuket], [munich, phuket]]);
    expect(local).toContainEqual(phuket);
    expect(local.some((c) => c[0] === munich[0] && c[1] === munich[1])).toBe(false);
    expect(MAX_DAY_CAMERA_SPAN_KM).toBeLessThan(1000);
  });

  it("resolveActiveDayRoute flight keeps camera on destination side", async () => {
    const munich: [number, number] = [11.58, 48.14];
    const phuket: [number, number] = [98.3, 7.88];
    const dayPlan = {
      day: 2,
      city: "Phuket",
      title: "Prihod v Phuket",
      mapPins: [{ name: "Hotel", lat: 7.89, lng: 98.29 }],
    } as unknown as DayPlan;
    const route: TripRouteSegment[] = [
      {
        id: "fly",
        mode: "flight",
        from: munich,
        to: phuket,
        coordinates: [munich, [50, 30], phuket],
        dayTo: 2,
        durationSeconds: 40000,
        durationLabel: "11h",
      },
    ];
    const dayCoords = new Map<number, [number, number]>([
      [1, munich],
      [2, phuket],
    ]);
    const result = await resolveActiveDayRoute({
      activeDay: 2,
      dayPlan,
      routeData: route,
      dayCoords,
      origin: munich,
      finalizedDays: [],
      token: null,
      preferDriving: false,
    });
    expect(result.drawRoute).toBe(true);
    expect(result.coordinates.length).toBeGreaterThan(2);
    expect(result.boundsPoints.some((c) => c[0] === munich[0] && c[1] === munich[1])).toBe(
      false,
    );
    expect(
      result.boundsPoints.every(
        (c) =>
          Math.hypot(c[0] - phuket[0], c[1] - phuket[1]) < 5 ||
          Math.abs(c[0] - 98.29) < 0.1,
      ),
    ).toBe(true);
  });

  it("resolveActiveDayRoute sightseeing ignores far previous-day endpoint", async () => {
    const munich: [number, number] = [11.58, 48.14];
    const aoNang: [number, number] = [98.83, 8.03];
    const dayPlan = {
      day: 7,
      city: "Ao Nang",
      title: "Plaže in otoki",
      mapPins: [{ name: "Railay", lat: 8.01, lng: 98.84 }],
    } as unknown as DayPlan;
    const dayCoords = new Map<number, [number, number]>([
      [6, munich], // bad leftover
      [7, aoNang],
    ]);
    const result = await resolveActiveDayRoute({
      activeDay: 7,
      dayPlan,
      routeData: [],
      dayCoords,
      origin: munich,
      finalizedDays: [],
      token: null,
      preferDriving: false,
    });
    expect(result.drawRoute).toBe(false);
    expect(result.boundsPoints.some((c) => c[0] === munich[0])).toBe(false);
    expect(result.boundsPoints.some((c) => Math.abs(c[0] - 98.84) < 0.05)).toBe(true);
  });

  it("pickPrimarySegment prefers flight over driving on same day", () => {
    const segments: TripRouteSegment[] = [
      {
        id: "drive",
        mode: "driving",
        from: [98, 7],
        to: [98.1, 7.1],
        coordinates: [
          [98, 7],
          [98.05, 7.05],
          [98.1, 7.1],
        ],
        dayTo: 3,
        durationSeconds: 600,
        durationLabel: "10m",
      },
      {
        id: "fly",
        mode: "flight",
        from: [14, 46],
        to: [98, 7],
        coordinates: [
          [14, 46],
          [20, 40],
          [98, 7],
        ],
        dayTo: 3,
        durationSeconds: 36000,
        durationLabel: "10h",
      },
    ];
    const primary = pickPrimarySegment(segments);
    expect(primary?.mode).toBe("flight");
  });

  it("shouldDrawDrivingRoute draws explicit driving segments without road-trip mode", () => {
    const endpoints = {
      from: [98.3, 7.9] as [number, number],
      to: [98.83, 8.03] as [number, number],
    };
    const drivingSeg: TripRouteSegment = {
      id: "leg-4-5",
      mode: "driving",
      from: endpoints.from,
      to: endpoints.to,
      coordinates: [endpoints.from, endpoints.to],
      dayTo: 5,
      durationSeconds: 9000,
      durationLabel: "2h 30m",
    };
    // Phuket → Krabi van day on a normal flight trip.
    expect(shouldDrawDrivingRoute(false, endpoints, drivingSeg)).toBe(true);
    expect(shouldDrawDrivingRoute(false, endpoints, null)).toBe(false);
    expect(shouldDrawDrivingRoute(true, null, null)).toBe(false);
    expect(shouldDrawDrivingRoute(true, endpoints, null)).toBe(true);
    const short = {
      from: [8.0, 48.0] as [number, number],
      to: [8.05, 48.02] as [number, number],
    };
    expect(shouldDrawDrivingRoute(true, short, null)).toBe(false);
    expect(MIN_ROAD_TRIP_DRAW_KM).toBeGreaterThanOrEqual(25);
  });
});
