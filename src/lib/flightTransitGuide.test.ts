import { describe, expect, it } from "vitest";
import {
  buildTransitGuide,
  connectionsFromFlightContext,
  connectionsFromMakeFlight,
  formatTransitGuidePdfLines,
  transitTimingBand,
} from "@/lib/flightTransitGuide";

describe("transitTimingBand", () => {
  it("treats under 2h as short", () => {
    expect(transitTimingBand(119)).toBe("short");
  });

  it("treats 2h–5h as optimal", () => {
    expect(transitTimingBand(120)).toBe("optimal");
    expect(transitTimingBand(240)).toBe("optimal");
    expect(transitTimingBand(299)).toBe("optimal");
  });

  it("treats 5h and over as long", () => {
    expect(transitTimingBand(300)).toBe("long");
    expect(transitTimingBand(8 * 60)).toBe("long");
  });
});

describe("buildTransitGuide", () => {
  it("returns null for a nonstop flight", () => {
    expect(connectionsFromMakeFlight({ postanki: "0/0" })).toEqual([]);
    expect(buildTransitGuide([])).toBeNull();
  });

  it("uses via airport from postanki when minutes are unknown", () => {
    const guide = buildTransitGuide(connectionsFromMakeFlight({ postanki: "1|PEK/0" }), "sl");
    expect(guide?.title).toMatch(/PEK/);
    expect(guide?.baggage).toMatch(/Oddana prtljaga/);
    expect(guide?.protocol).toMatch(/Transfers \/ Connecting Flights/);
    expect(guide?.connections[0]?.timing).toBeUndefined();
  });

  it("adds the short-connection warning under 2h", () => {
    const guide = buildTransitGuide(
      connectionsFromFlightContext({
        outboundStops: 1,
        outboundVia: "DXB",
        outboundLayovers: [{ iata: "DXB", minutes: 95 }],
      }),
      "sl",
    );
    expect(guide?.connections[0]?.timingBand).toBe("short");
    expect(guide?.connections[0]?.timing).toMatch(/Kratek prestop/);
  });

  it("adds the long-layover lounge tip over 5h", () => {
    const guide = buildTransitGuide(
      connectionsFromFlightContext({
        outboundStops: 1,
        outboundLayovers: [{ iata: "IST", minutes: 6 * 60 }],
      }),
      "sl",
    );
    expect(guide?.connections[0]?.timing).toMatch(/Daljši prestop/);
    expect(guide?.connections[0]?.timing).toMatch(/Lounge/);
  });
});

describe("formatTransitGuidePdfLines", () => {
  it("includes baggage, protocol and timing", () => {
    const guide = buildTransitGuide(
      connectionsFromFlightContext({
        outboundStops: 1,
        outboundLayovers: [{ iata: "AUH", minutes: 150 }],
      }),
      "sl",
    );
    expect(guide).toBeTruthy();
    const lines = formatTransitGuidePdfLines(guide!);
    expect(lines.join("\n")).toMatch(/Nasveti za prestop/);
    expect(lines.join("\n")).toMatch(/Oddana prtljaga/);
    expect(lines.join("\n")).toMatch(/Optimalen prestop/);
    expect(lines.join("\n")).toMatch(/AUH/);
  });
});
