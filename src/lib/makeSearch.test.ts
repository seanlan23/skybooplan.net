import { describe, expect, it } from "vitest";
import {
  isMakeAsyncAccepted,
  parseMakeSearchFlights,
  parseMakeWebhookBody,
  parseSearchRequestBody,
} from "./makeSearch";

describe("parseSearchRequestBody", () => {
  it("accepts a trimmed query string", () => {
    expect(parseSearchRequestBody({ query: "  Pariz  " })).toEqual({ query: "Pariz" });
  });

  it("rejects missing or empty query", () => {
    expect(parseSearchRequestBody({})).toBeNull();
    expect(parseSearchRequestBody({ query: "   " })).toBeNull();
  });

  it("accepts optional attachment metadata", () => {
    expect(
      parseSearchRequestBody({
        query: "Pariz",
        attachment: {
          filename: "trip.jpg",
          mimeType: "image/jpeg",
          kind: "image",
          base64: "abc123",
        },
      }),
    ).toEqual({
      query: "Pariz",
      attachment: {
        filename: "trip.jpg",
        mimeType: "image/jpeg",
        kind: "image",
        base64: "abc123",
      },
    });
  });

  it("accepts optional coordinates", () => {
    expect(
      parseSearchRequestBody({
        query: "Pariz",
        latitude: 46.0569,
        longitude: 14.5058,
      }),
    ).toEqual({
      query: "Pariz",
      latitude: 46.0569,
      longitude: 14.5058,
    });
  });
});

describe("parseMakeWebhookBody", () => {
  it("wraps plain Accepted text as async acknowledgement", () => {
    const result = parseMakeWebhookBody("Accepted", 200);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        accepted: true,
        async: true,
        code: "MAKE_WEBHOOK_ASYNC",
        message: "Accepted",
        flights: [],
      });
    }
  });

  it("treats HTTP 202 as async acknowledgement", () => {
    const result = parseMakeWebhookBody('{"jobId":"abc"}', 202);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isMakeAsyncAccepted(result.data)).toBe(true);
    }
  });
});

describe("parseMakeSearchFlights", () => {
  it("parses a flights array from Make webhook JSON", () => {
    const result = parseMakeSearchFlights({
      flights: [
        {
          destinacija: "Pariz",
          cena_eur: 189,
          odhod: "2026-07-01",
          prevoznik: "Air France",
          postanki: 0,
          ai_povzetek: "Direkten let iz Ljubljane.",
          booking_url: "https://example.com/book",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      destinacija: "Pariz",
      cena_eur: 189,
      prevoznik: "Air France",
      postanki: "0",
      booking_url: "https://example.com/book",
    });
  });

  it("parses Make.com offers array with structured flight fields", () => {
    const result = parseMakeSearchFlights({
      offers: [
        {
          rank: "rank1",
          badge: "Najboljsa vrednost",
          origin_iata: "LJU",
          destination_iata: "BKK",
          departure_datetime: "2026-10-15T20:15:00",
          arrival_datetime: "2026-10-17T05:40:00",
          stops_outbound: 0,
          airline_name: "Turkish Airlines",
          price_total: 669.91,
          price_currency: "EUR",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "rank1",
      destinacija: "LJU → BKK",
      cena_eur: 669.91,
      prevoznik: "Turkish Airlines",
      postanki: "0",
      badge: "Najboljsa vrednost",
      ai_povzetek: "Najboljsa vrednost",
    });
    expect(result[0]?.odhod).toContain("2026");
  });
});
