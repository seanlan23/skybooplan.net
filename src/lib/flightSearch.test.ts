import { describe, expect, it } from "vitest";
import {
  buildDuffelSlices,
  isClassicRoundTrip,
  isMultiCitySearch,
  resolveInboundRoute,
} from "@/lib/flightSearch";
import { mapDuffelOfferToFlight, filterFlightsForTripType, type DuffelFlight } from "@/lib/flights.functions";

describe("flightSearch", () => {
  it("builds classic round-trip slices", () => {
    expect(
      buildDuffelSlices({
        from: "MXP",
        to: "JFK",
        departDate: "2026-06-01",
        returnDate: "2026-06-21",
        pax: 1,
      }),
    ).toEqual([
      { origin: "MXP", destination: "JFK", departure_date: "2026-06-01" },
      { origin: "JFK", destination: "MXP", departure_date: "2026-06-21" },
    ]);
  });

  it("builds multi-city slices from legs array", () => {
    expect(
      buildDuffelSlices({
        tripType: "multicity",
        slices: [
          { from: "MXP", to: "JFK", departDate: "2026-06-01" },
          { from: "LAX", to: "MXP", departDate: "2026-06-21" },
        ],
        pax: 2,
      }),
    ).toEqual([
      { origin: "MXP", destination: "JFK", departure_date: "2026-06-01" },
      { origin: "LAX", destination: "MXP", departure_date: "2026-06-21" },
    ]);
    expect(isMultiCitySearch({ tripType: "multicity", slices: [{ from: "A", to: "B", departDate: "2026-01-01" }, { from: "C", to: "A", departDate: "2026-01-10" }] })).toBe(true);
  });

  it("resolves open-jaw inbound route from actual leg IATA codes", () => {
    const outbound = { from: "MXP", to: "JFK" };
    const inbound = { from: "LAX", to: "MXP", depart: "14:00", arrive: "12:00", date: "2026-06-21", duration: "12h", durationMin: 720, stops: 0, airline: "LH", airlineCode: "LH", arriveDayOffset: 1 };
    expect(isClassicRoundTrip(outbound, inbound)).toBe(false);
    expect(resolveInboundRoute(outbound, inbound, "multicity")).toEqual({ from: "LAX", to: "MXP" });
    expect(resolveInboundRoute(outbound, { ...inbound, from: "JFK", to: "MXP" }, "roundtrip")).toEqual({
      from: "JFK",
      to: "MXP",
    });
  });
});

describe("open-jaw offer mapping", () => {
  it("tags two-leg open-jaw as multicity", () => {
    const flight = mapDuffelOfferToFlight({
      id: "open-jaw",
      total_amount: "890.00",
      total_currency: "EUR",
      owner: { name: "United", iata_code: "UA" },
      slices: [
        {
          origin: { iata_code: "MXP" },
          destination: { iata_code: "JFK" },
          duration: "PT10H",
          segments: [
            {
              departing_at: "2026-06-01T10:00:00+02:00",
              arriving_at: "2026-06-01T14:30:00-04:00",
              origin: { iata_code: "MXP" },
              destination: { iata_code: "JFK" },
              marketing_carrier: { name: "United", iata_code: "UA" },
            },
          ],
        },
        {
          origin: { iata_code: "LAX" },
          destination: { iata_code: "MXP" },
          duration: "PT12H",
          segments: [
            {
              departing_at: "2026-06-21T18:00:00-07:00",
              arriving_at: "2026-06-22T14:00:00+02:00",
              origin: { iata_code: "LAX" },
              destination: { iata_code: "MXP" },
              marketing_carrier: { name: "United", iata_code: "UA" },
            },
          ],
        },
      ],
    });

    expect(flight?.tripKind).toBe("multicity");
    expect(flight?.inbound?.from).toBe("LAX");
    expect(flight?.inbound?.to).toBe("MXP");
    expect(flight?.legs).toHaveLength(2);
  });
});

describe("filterFlightsForTripType", () => {
  const roundTripFlight = {
    id: "rt-1",
    outbound: { from: "MXP", to: "JFK" },
    inbound: { from: "JFK", to: "MXP" },
    legs: [{}, {}],
  } as DuffelFlight;

  it("requires inbound slice for return searches", () => {
    const oneWayOnly = { ...roundTripFlight, inbound: undefined, legs: [{}] } as DuffelFlight;
    const result = filterFlightsForTripType([oneWayOnly], {
      from: "MXP",
      to: "JFK",
      departDate: "2026-06-01",
      returnDate: "2026-06-10",
      tripType: "return",
      pax: 1,
    });
    expect(result.error).toBe("error.roundTripUnavailable");
    expect(result.flights).toHaveLength(0);
  });

  it("keeps two-leg offers for return searches", () => {
    const result = filterFlightsForTripType([roundTripFlight], {
      from: "MXP",
      to: "JFK",
      departDate: "2026-06-01",
      returnDate: "2026-06-10",
      tripType: "return",
      pax: 1,
    });
    expect(result.error).toBeNull();
    expect(result.flights).toHaveLength(1);
  });
});
