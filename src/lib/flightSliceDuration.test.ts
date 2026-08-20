import { describe, expect, it } from "vitest";
import { duffelSliceDurationMin } from "@/lib/flightSliceDuration";

describe("duffelSliceDurationMin", () => {
  it("uses Duffel slice.duration when it is the full total", () => {
    expect(
      duffelSliceDurationMin({
        duration: "PT17H50M",
        segments: [
          {
            duration: "PT10H20M",
            departing_at: "2026-10-26T19:15:00+02:00",
            arriving_at: "2026-10-27T12:35:00+09:00",
            origin: { iata_code: "VIE" },
            destination: { iata_code: "ICN" },
          },
          {
            duration: "PT2H10M",
            departing_at: "2026-10-27T16:00:00+09:00",
            arriving_at: "2026-10-27T21:05:00+09:00",
            origin: { iata_code: "ICN" },
            destination: { iata_code: "NRT" },
          },
        ],
      }),
    ).toBe(17 * 60 + 50);
  });

  it("ignores a slice.duration that is just the last segment (CA979 5h 10m)", () => {
    const mins = duffelSliceDurationMin({
      duration: "PT5H10M",
      segments: [
        {
          duration: "PT9H20M",
          departing_at: "2026-11-20T13:00:00+01:00",
          arriving_at: "2026-11-21T04:50:00+08:00",
          origin: { iata_code: "VIE" },
          destination: { iata_code: "PEK" },
        },
        {
          duration: "PT5H10M",
          departing_at: "2026-11-21T20:00:00+08:00",
          arriving_at: "2026-11-22T00:10:00+07:00",
          origin: { iata_code: "PEK" },
          destination: { iata_code: "BKK" },
        },
      ],
    });
    // 9h20 air + 15h10 PEK layover + 5h10 air
    expect(mins).toBe(9 * 60 + 20 + 15 * 60 + 10 + 5 * 60 + 10);
  });

  it("does not keep naive NRT→VIE wall PT7H40M", () => {
    expect(
      duffelSliceDurationMin({
        duration: "PT7H40M",
        segments: [
          {
            duration: "PT2H25M",
            departing_at: "2026-11-10T09:15:00",
            arriving_at: "2026-11-10T12:40:00",
            origin: { iata_code: "NRT" },
            destination: { iata_code: "ICN" },
          },
          {
            duration: "PT11H20M",
            departing_at: "2026-11-10T14:30:00",
            arriving_at: "2026-11-10T16:55:00",
            origin: { iata_code: "ICN" },
            destination: { iata_code: "VIE" },
          },
        ],
      }),
    ).toBe(15 * 60 + 35);
  });

  it("does not keep PEK→FRA hop as NRT→FRA total (11h 20m)", () => {
    const mins = duffelSliceDurationMin({
      duration: "PT11H20M",
      segments: [
        {
          duration: "PT3H20M",
          departing_at: "2026-11-04T13:15:00+09:00",
          arriving_at: "2026-11-04T16:00:00+08:00",
          origin: { iata_code: "NRT" },
          destination: { iata_code: "PEK" },
        },
        {
          duration: "PT10H50M",
          departing_at: "2026-11-04T18:00:00+08:00",
          arriving_at: "2026-11-04T16:35:00+01:00",
          origin: { iata_code: "PEK" },
          destination: { iata_code: "FRA" },
        },
      ],
    });
    expect(mins).toBe(3 * 60 + 20 + 2 * 60 + 10 * 60 + 50);
    expect(mins).toBeGreaterThan(14 * 60);
  });
});
