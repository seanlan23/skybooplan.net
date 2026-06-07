import { describe, expect, it, vi } from "vitest";
import type { SegmentSpec } from "@/lib/tripMapRoutes";
import { resolveOneSegment, resolveSegmentGeometries } from "@/lib/tripMapRoutes";

describe("resolveSegmentGeometries graceful degradation", () => {
  it("returns fallback for failed driving segment and keeps other segments", async () => {
    const specs: SegmentSpec[] = [
      {
        id: "leg-1-2",
        mode: "driving",
        from: [14.505, 46.051],
        to: [12.315, 45.441],
        dayTo: 2,
      },
      {
        id: "leg-2-3",
        mode: "flight",
        from: [12.315, 45.441],
        to: [12.496, 41.902],
        dayTo: 3,
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Mapbox unavailable"))),
    );

    const resolved = await resolveSegmentGeometries(specs, "test-token");
    expect(resolved).toHaveLength(2);
    expect(resolved[0]!.id).toBe("leg-1-2");
    expect(resolved[0]!.coordinates.length).toBeGreaterThanOrEqual(2);
    expect(resolved[1]!.id).toBe("leg-2-3");

    vi.unstubAllGlobals();
  });

  it("resolveOneSegment never throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );

    const segment = await resolveOneSegment(
      {
        id: "leg-1-2",
        mode: "driving",
        from: [14.505, 46.051],
        to: [12.315, 45.441],
        dayTo: 2,
      },
      "token",
    );

    expect(segment).not.toBeNull();
    expect(segment!.coordinates.length).toBeGreaterThanOrEqual(2);

    vi.unstubAllGlobals();
  });
});
