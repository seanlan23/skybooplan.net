import { describe, expect, it } from "vitest";
import { mapDuffelOfferToFlight } from "@/lib/flights.functions";

describe("mapDuffelOfferToFlight", () => {
  it("maps each slice independently for round-trip offers", () => {
    const first = mapDuffelOfferToFlight({
      id: "offer-1",
      total_amount: "573.40",
      total_currency: "EUR",
      owner: { name: "Lufthansa", iata_code: "LH" },
      slices: [
        {
          origin: { iata_code: "MIL" },
          destination: { iata_code: "BKK" },
          duration: "PT13H20M",
          segments: [
            {
              departing_at: "2026-07-10T09:15:00+02:00",
              arriving_at: "2026-07-11T01:35:00+07:00",
              origin: { iata_code: "MXP" },
              destination: { iata_code: "BKK" },
              marketing_carrier: { name: "Lufthansa", iata_code: "LH" },
            },
          ],
        },
        {
          origin: { iata_code: "BKK" },
          destination: { iata_code: "MIL" },
          duration: "PT14H10M",
          segments: [
            {
              departing_at: "2026-07-20T14:00:00+07:00",
              arriving_at: "2026-07-20T22:00:00+02:00",
              origin: { iata_code: "BKK" },
              destination: { iata_code: "MXP" },
              marketing_carrier: { name: "Lufthansa", iata_code: "LH" },
            },
          ],
        },
      ],
    });

    const second = mapDuffelOfferToFlight({
      id: "offer-2",
      total_amount: "612.10",
      total_currency: "EUR",
      owner: { name: "Turkish Airlines", iata_code: "TK" },
      slices: [
        {
          origin: { iata_code: "MIL" },
          destination: { iata_code: "BKK" },
          duration: "PT16H05M",
          segments: [
            {
              departing_at: "2026-07-10T11:40:00+02:00",
              arriving_at: "2026-07-11T06:45:00+07:00",
              origin: { iata_code: "MXP" },
              destination: { iata_code: "BKK" },
              marketing_carrier: { name: "Turkish Airlines", iata_code: "TK" },
            },
          ],
        },
        {
          origin: { iata_code: "BKK" },
          destination: { iata_code: "MIL" },
          duration: "PT15H30M",
          segments: [
            {
              departing_at: "2026-07-20T18:30:00+07:00",
              arriving_at: "2026-07-21T03:00:00+02:00",
              origin: { iata_code: "BKK" },
              destination: { iata_code: "MXP" },
              marketing_carrier: { name: "Turkish Airlines", iata_code: "TK" },
            },
          ],
        },
      ],
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.price).toBe(573);
    expect(second!.price).toBe(612);
    expect(first!.outbound.depart).toBe("09:15");
    expect(second!.outbound.depart).toBe("11:40");
    expect(first!.inbound?.depart).toBe("14:00");
    expect(second!.inbound?.depart).toBe("18:30");
    expect(first!.inbound?.duration).toBe("14h 10m");
    expect(second!.inbound?.duration).toBe("15h 30m");
    expect(first!.durationMin).toBeGreaterThan(first!.outbound.durationMin);
    expect(first!.outbound.arriveDayOffset).toBe(1);
    expect(second!.outbound.arriveDayOffset).toBe(1);
    expect(second!.inbound?.arriveDayOffset).toBe(1);
  });

  it("falls back to segment timestamps when slice duration is missing", () => {
    const flight = mapDuffelOfferToFlight({
      id: "offer-3",
      total_amount: "601.00",
      total_currency: "EUR",
      owner: { name: "Etihad Airways", iata_code: "EY" },
      slices: [
        {
          origin: { iata_code: "MIL" },
          destination: { iata_code: "BKK" },
          duration: "PT0M",
          segments: [
            {
              departing_at: "2026-10-15T11:40:00+02:00",
              arriving_at: "2026-10-16T12:10:00+07:00",
              origin: { iata_code: "MXP" },
              destination: { iata_code: "BKK" },
              marketing_carrier: { name: "Etihad Airways", iata_code: "EY" },
            },
          ],
        },
        {
          origin: { iata_code: "BKK" },
          destination: { iata_code: "MIL" },
          duration: "",
          segments: [
            {
              departing_at: "2026-10-31T14:40:00+07:00",
              arriving_at: "2026-10-31T18:10:00+01:00",
              origin: { iata_code: "BKK" },
              destination: { iata_code: "MXP" },
              marketing_carrier: { name: "Etihad Airways", iata_code: "EY" },
            },
          ],
        },
      ],
    });

    expect(flight).not.toBeNull();
    expect(flight!.outbound.arriveDayOffset).toBe(1);
    expect(flight!.outbound.durationMin).toBeGreaterThan(600);
    expect(flight!.inbound?.durationMin).toBeGreaterThan(0);
    expect(flight!.inbound?.duration).not.toBe("0m");
  });
});
