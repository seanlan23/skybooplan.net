import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildMakeAsyncPayload,
  callMakeSearchWebhook,
  fetchNearestAirports,
  isMakeAsyncAccepted,
  parseMakeSearchDates,
  parseMakeSearchDestination,
  parseMakeSearchFlights,
  parseMakeSearchPassengers,
  flattenMakeDataStoreRecord,
  parseMakeSearchStatus,
  parseMakeSearchUserMessage,
  parseMakeWebhookBody,
  parseSearchRequestBody,
  unwrapMakeSearchOffersPayload,
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

describe("parseMakeSearchUserMessage", () => {
  const ref = new Date("2026-06-07T12:00:00Z");

  it("maps tajska to BKK and parses passengers and vague month", () => {
    const parsed = parseMakeSearchUserMessage(
      "Potovanje v Tajska, termin oktober, 2 odrasla, 1 otrok",
      ["LJU", "ZAG", "VIE"],
    );

    expect(parsed).toMatchObject({
      origin_airports: ["LJU", "ZAG", "VIE"],
      destination_airport: "BKK",
      departure_date: "2026-10-15",
      return_date: "2026-10-29",
      passengers: { adults: 2, children: 1 },
    });
  });

  it("parses konec oktobra as late October departure", () => {
    const parsed = parseMakeSearchDates("Leti v Mehiko, konec oktobra", ref);
    expect(parsed.departure_date).toBe("2026-10-26");
    expect(parsed.return_date).toBe("2026-11-09");
  });
});

describe("parseMakeSearchDestination", () => {
  it("recognises Slovenian country names", () => {
    expect(parseMakeSearchDestination("Leti v Tajska")).toBe("BKK");
    expect(parseMakeSearchDestination("Potovanje na Bali")).toBe("DPS");
  });
});

describe("parseMakeSearchPassengers", () => {
  it("defaults to one adult", () => {
    expect(parseMakeSearchPassengers("Leti v Pariz")).toEqual({ adults: 1, children: 0 });
  });

  it("parses Slovenian passenger counts", () => {
    expect(parseMakeSearchPassengers("2 odrasla, 1 otrok")).toEqual({ adults: 2, children: 1 });
  });
});

describe("fetchNearestAirports", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses IATAGeo getCode fan-out and ranks by distance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("iatageo.com/getCode/")) {
          const lat = Number.parseFloat(url.split("/").at(-2) ?? "0");
          if (lat > 46.2) {
            return { ok: true, json: async () => ({ IATA: "ZAG", code: "ZAG" }) };
          }
          return { ok: true, json: async () => ({ IATA: "LJU", code: "LJU" }) };
        }
        if (url.includes("iatageo.com/v2/airports/iata/LJU")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: { iataCode: "LJU", coordinates: { latitude: 46.224, longitude: 14.456 } },
            }),
          };
        }
        if (url.includes("iatageo.com/v2/airports/iata/ZAG")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: { iataCode: "ZAG", coordinates: { latitude: 45.743, longitude: 16.069 } },
            }),
          };
        }
        return { ok: false, json: async () => null };
      }),
    );

    const result = await fetchNearestAirports(46.05, 14.5);
    expect(result[0]).toBe("LJU");
    expect(result).toContain("ZAG");
  });
});

describe("callMakeSearchWebhook", () => {
  const originalEnv = process.env.MAKE_WEBHOOK_URL;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalEnv == null) delete process.env.MAKE_WEBHOOK_URL;
    else process.env.MAKE_WEBHOOK_URL = originalEnv;
  });

  it("includes parsedData in the webhook payload", async () => {
    process.env.MAKE_WEBHOOK_URL = "https://example.com/make-webhook";

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("iatageo.com/getCode/")) {
        return { ok: true, json: async () => ({ IATA: "LJU", code: "LJU" }) };
      }
      if (url.includes("iatageo.com/v2/airports/iata/")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { iataCode: "LJU", coordinates: { latitude: 46.224, longitude: 14.456 } },
          }),
        };
      }
      if (url === "https://example.com/make-webhook") {
        const body = JSON.parse(String(init?.body));
        expect(body.searchId).toEqual(expect.any(String));
        expect(body).toMatchObject({
          userMessage: "Potovanje v Tajska, termin oktober, 2 odrasla, 1 otrok",
          latitude: 46.05,
          longitude: 14.5,
          parsedData: {
            origin_airports: ["LJU"],
            destination_airport: "BKK",
            departure_date: "2026-10-15",
            return_date: "2026-10-29",
            passengers: { adults: 2, children: 1 },
          },
        });
        return { ok: true, status: 200, text: async () => '{"offers":[]}' };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callMakeSearchWebhook({
      userMessage: "Potovanje v Tajska, termin oktober, 2 odrasla, 1 otrok",
      latitude: 46.05,
      longitude: 14.5,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("parseMakeSearchStatus", () => {
  it("parses offers stored as a JSON string in Data Store", () => {
    const offers = [
      {
        rank: "rank1",
        origin_iata: "LJU",
        destination_iata: "BKK",
        airline_name: "Turkish Airlines",
        price_total: 669.91,
        price_currency: "EUR",
        stops_outbound: 0,
      },
    ];
    const result = parseMakeSearchStatus({
      key: "abc-123",
      offers: JSON.stringify(offers),
    });
    expect(result.status).toBe("ready");
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0]?.prevoznik).toBe("Turkish Airlines");
  });

  it("parses raw Duffel offers from Make Data Store without Gemini", () => {
    const duffelPayload = {
      data: {
        data: {
          id: "orq_test",
          offers: [
            {
              id: "off_expensive",
              total_amount: "320.00",
              total_currency: "EUR",
              owner: { name: "Lufthansa", iata_code: "LH" },
              slices: [
                {
                  origin: { iata_code: "LJU" },
                  destination: { iata_code: "CDG" },
                  segments: [
                    {
                      departing_at: "2026-08-15T08:00:00+02:00",
                      arriving_at: "2026-08-15T10:00:00+02:00",
                      origin: { iata_code: "LJU" },
                      destination: { iata_code: "CDG" },
                      marketing_carrier: { name: "Lufthansa", iata_code: "LH" },
                    },
                  ],
                },
              ],
            },
            {
              id: "off_cheap",
              total_amount: "149.50",
              total_currency: "EUR",
              owner: { name: "Air France", iata_code: "AF" },
              slices: [
                {
                  origin: { iata_code: "LJU" },
                  destination: { iata_code: "CDG" },
                  segments: [
                    {
                      departing_at: "2026-08-15T06:30:00+02:00",
                      arriving_at: "2026-08-15T08:40:00+02:00",
                      origin: { iata_code: "LJU" },
                      destination: { iata_code: "CDG" },
                      marketing_carrier: { name: "Air France", iata_code: "AF" },
                    },
                  ],
                },
              ],
            },
            {
              id: "off_mid",
              total_amount: "210.00",
              total_currency: "EUR",
              owner: { name: "KLM", iata_code: "KL" },
              slices: [
                {
                  origin: { iata_code: "LJU" },
                  destination: { iata_code: "CDG" },
                  segments: [
                    {
                      departing_at: "2026-08-15T12:00:00+02:00",
                      arriving_at: "2026-08-15T14:10:00+02:00",
                      origin: { iata_code: "LJU" },
                      destination: { iata_code: "CDG" },
                      marketing_carrier: { name: "KLM", iata_code: "KL" },
                    },
                  ],
                },
              ],
            },
            {
              id: "off_skip",
              total_amount: "400.00",
              total_currency: "EUR",
              owner: { name: "Swiss", iata_code: "LX" },
              slices: [
                {
                  origin: { iata_code: "LJU" },
                  destination: { iata_code: "CDG" },
                  segments: [
                    {
                      departing_at: "2026-08-15T18:00:00+02:00",
                      arriving_at: "2026-08-15T20:00:00+02:00",
                      origin: { iata_code: "LJU" },
                      destination: { iata_code: "CDG" },
                      marketing_carrier: { name: "Swiss", iata_code: "LX" },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    };

    const result = parseMakeSearchStatus({
      key: "abc-123",
      status: "done",
      offers: JSON.stringify(duffelPayload),
    });

    expect(result.status).toBe("ready");
    expect(result.flights).toHaveLength(3);
    expect(result.flights[0]?.prevoznik).toBe("Air France");
    expect(result.flights[0]?.cena_eur).toBe(149.5);
    expect(result.flights[0]?.badge).toBe("Najcenejši");
    expect(result.flights.map((f) => f.id)).toEqual([
      "off_cheap",
      "off_mid",
      "off_expensive",
    ]);
  });

  it("parses Duffel GET offers list shape from status webhook (offers.data)", () => {
    const result = parseMakeSearchStatus({
      key: "live-test",
      status: "done",
      offers: {
        meta: { limit: 8, before: null, after: "g2EI" },
        data: [
          {
            id: "off_lh",
            total_amount: "243.60",
            total_currency: "EUR",
            owner: { name: "Lufthansa", iata_code: "LH" },
            slices: [
              {
                origin: { iata_code: "LJU" },
                destination: { iata_code: "CDG" },
                segments: [
                  {
                    departing_at: "2026-08-15T08:00:00+02:00",
                    origin: { iata_code: "LJU" },
                    destination: { iata_code: "CDG" },
                    marketing_carrier: { name: "Lufthansa", iata_code: "LH" },
                  },
                ],
              },
            ],
          },
          {
            id: "off_af",
            total_amount: "199.00",
            total_currency: "EUR",
            owner: { name: "Air France", iata_code: "AF" },
            slices: [
              {
                origin: { iata_code: "LJU" },
                destination: { iata_code: "CDG" },
                segments: [
                  {
                    departing_at: "2026-08-15T06:30:00+02:00",
                    origin: { iata_code: "LJU" },
                    destination: { iata_code: "CDG" },
                    marketing_carrier: { name: "Air France", iata_code: "AF" },
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(result.status).toBe("ready");
    expect(result.flights).toHaveLength(2);
    expect(result.flights[0]?.prevoznik).toBe("Air France");
    expect(result.flights[0]?.cena_eur).toBe(199);
  });

  it("returns pending when offers are still empty", () => {
    const result = parseMakeSearchStatus({ key: "abc-123", offers: "" });
    expect(result.status).toBe("pending");
  });

  it("treats Make async Accepted acknowledgement as pending, not error", () => {
    const result = parseMakeSearchStatus(buildMakeAsyncPayload("Accepted"));
    expect(result.status).toBe("pending");
    expect(result.flights).toHaveLength(0);
  });

  it("returns error when status webhook returns bare module id 2", () => {
    const result = parseMakeSearchStatus("2");
    expect(result.status).toBe("error");
    expect(result.error).toContain("Status webhook");
  });

  it("returns error when Data Store status is done but offers are empty", () => {
    const result = parseMakeSearchStatus({ key: "abc-123", status: "done", offers: "" });
    expect(result.status).toBe("error");
    expect(result.error).toContain("brez letov");
  });

  it("parses Make Get record shape with nested data.offers", () => {
    const offers = [
      {
        rank: 1,
        origin_iata: "HAJ",
        destination_iata: "IST",
        airline_name: "Turkish Airlines",
        price_total: 187.23,
        price_currency: "EUR",
        stops_outbound: 0,
      },
    ];
    const result = parseMakeSearchStatus({
      key: "abc-123",
      data: {
        offers: JSON.stringify(offers),
        status: "done",
      },
    });
    expect(result.status).toBe("ready");
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0]?.prevoznik).toBe("Turkish Airlines");
  });

  it("flattenMakeDataStoreRecord merges nested data fields", () => {
    const flat = flattenMakeDataStoreRecord({
      key: "search-1",
      data: { offers: "[]", status: "done" },
    });
    expect(flat?.key).toBe("search-1");
    expect(flat?.status).toBe("done");
    expect(flat?.offers).toBe("[]");
  });

  it("parses Gemini markdown-fenced offers stored as a string", () => {
    const offers = [
      {
        rank: 1,
        badge: "Najboljša vrednost",
        origin_iata: "HAJ",
        destination_iata: "SAW",
        departure_datetime: "2026-08-04T01:25:00",
        airline_name: "Pegasus Airlines",
        price_total: 141.48,
        price_currency: "EUR",
        stops_outbound: 0,
      },
    ];
    const fenced = "```json\n" + JSON.stringify(offers) + "\n```";
    const result = parseMakeSearchStatus({ key: "abc-123", status: "done", offers: fenced });
    expect(result.status).toBe("ready");
    expect(result.flights).toHaveLength(1);
    expect(result.flights[0]?.prevoznik).toBe("Pegasus Airlines");
    expect(result.flights[0]?.cena_eur).toBe(141.48);
  });
});
