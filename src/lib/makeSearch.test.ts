import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildMakeAsyncPayload,
  callMakeSearchWebhook,
  fetchNearestAirports,
  isMakeAsyncAccepted,
  mergeAndRankMakeSearchFlights,
  parseMakeSearchDates,
  parseMakeSearchDestination,
  parseMakeSearchFlights,
  skyscannerUrlForMakeFlight,
  buildSkyscannerFlightUrl,
  formatTravelDuration,
  parseDurationMinutes,
  pickTravelDurationRaw,
  scoreMakeSearchFlight,
  parseMakeSearchPassengers,
  flattenMakeDataStoreRecord,
  parseMakeSearchStatus,
  parseMakeSearchUserMessage,
  parseMakeWebhookBody,
  parseSearchRequestBody,
  tagMakeSearchFlightsWithOrigin,
  unwrapMakeSearchOffersPayload,
  type MakeSearchFlight,
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
      ai_povzetek: "",
      origin_iata: "LJU",
      destination_iata: "BKK",
      depart_date: "2026-10-15",
    });
    expect(result[0]?.odhod).toContain("2026");
    expect(
      skyscannerUrlForMakeFlight(result[0]!, 2),
    ).toBe(
      "https://www.skyscanner.net/transport/flights/lju/bkk/261015/?adults=2",
    );
  });

  it("builds round-trip Skyscanner URLs", () => {
    expect(
      buildSkyscannerFlightUrl({
        from: "VIE",
        to: "HKT",
        departDate: "2026-10-26",
        returnDate: "2026-11-09",
        adults: 2,
      }),
    ).toBe(
      "https://www.skyscanner.net/transport/flights/vie/hkt/261026/261109/?adults=2",
    );
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
      origin_airports: ["VIE", "LJU", "ZAG"],
      origin_airport: "VIE",
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

  it("defaults origin to LJU when none provided", () => {
    const parsed = parseMakeSearchUserMessage("Leti v Tajska, konec oktobra začetek novembra");
    expect(parsed.origin_airports).toEqual(["LJU"]);
    expect(parsed.origin_airport).toBe("LJU");
    expect(parsed.destination_airport).toBe("BKK");
    expect(parsed.departure_date).toBe("2026-10-26");
    expect(parsed.return_date).toBe("2026-11-05");
  });

  it("parses multiple named origin airports from chat", () => {
    const parsed = parseMakeSearchUserMessage(
      "tajska 14 dni konec oktobra začetek novembra. Glej letališča Lj, Dunaj, Milano, Budimpešta",
    );
    expect(parsed.destination_airport).toBe("BKK");
    // Prefer a major hub first (VIE) so Make first()/origin_airport is not stuck on LJU.
    expect(parsed.origin_airport).toBe("VIE");
    expect(parsed.origin_airports[0]).toBe("VIE");
    expect(parsed.origin_airports).toEqual(expect.arrayContaining(["LJU", "VIE", "MXP", "BUD"]));
    expect(parsed.departure_date).toBe("2026-10-26");
    expect(parsed.return_date).toBe("2026-11-09");
  });

  it("maps južna tajska / phuket to HKT not BKK", () => {
    expect(parseMakeSearchDestination("potovanje na južno tajsko (phuket)")).toBe("HKT");
    expect(parseMakeSearchDestination("južna tajska")).toBe("HKT");
    expect(parseMakeSearchDestination("jug tajske iz phuketa")).toBe("HKT");
  });

  it("does not treat Potovanje v … as destination IATA POT", () => {
    const parsed = parseMakeSearchUserMessage(
      "Potovanje v potovanje na južno tajsko (phuket), konec oktobra",
    );
    expect(parsed.destination_airport).toBe("HKT");
  });

  it("parses rich Thailand chat without mistaking cae typo for CAE airport", () => {
    const parsed = parseMakeSearchUserMessage(
      "Ljubljana → potovanje na jug tajske po možnosti prihod in odhod iz phuketa. Konec oktobra zaetek novembra za 14 nočitev. Let naj bo oi lj, dunaja, milana, zagreba ali budimšete. Cena in cae potovanja sta najpomebnejša",
    );
    expect(parsed.destination_airport).toBe("HKT");
    expect(parsed.origin_airport).toBe("VIE");
    expect(parsed.origin_airports).toEqual(
      expect.arrayContaining(["LJU", "VIE", "MXP", "ZAG"]),
    );
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
            origin_airport: "LJU",
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
    expect(result.flights[0]?.badge).toBe("best");
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
                duration: "PT2H15M",
                segments: [
                  {
                    departing_at: "2026-08-15T08:00:00+02:00",
                    arriving_at: "2026-08-15T10:15:00+02:00",
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
                duration: "PT1H55M",
                segments: [
                  {
                    departing_at: "2026-08-15T06:30:00+02:00",
                    arriving_at: "2026-08-15T08:25:00+02:00",
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
    expect(result.flights[0]?.outbound_duration).toBe("1h 55m");
    expect(formatTravelDuration("PT23H15M")).toBe("23h 15m");
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

describe("pickTravelDurationRaw / long-haul", () => {
  it("prefers Duffel slice duration over naive local-clock gap", () => {
    // Wall clock MXP→HKT without TZ looks like ~7h; real slice is ~14h+.
    const picked = pickTravelDurationRaw("PT7H20M", "PT14H35M", "7h 20m");
    expect(formatTravelDuration(picked)).toBe("14h 35m");
  });

  it("computes MXP→HKT elapsed from offset timestamps, not wall clocks", () => {
    const result = parseMakeSearchFlights({
      flights: [
        {
          id: "off_ey",
          total_amount: "603.00",
          total_currency: "EUR",
          owner: { name: "Etihad", iata_code: "EY" },
          slices: [
            {
              origin: { iata_code: "MXP" },
              destination: { iata_code: "HKT" },
              duration: "PT14H35M",
              segments: [
                {
                  departing_at: "2026-10-26T10:30:00+01:00",
                  arriving_at: "2026-10-26T19:10:00+04:00",
                  origin: { iata_code: "MXP" },
                  destination: { iata_code: "AUH" },
                  marketing_carrier: { name: "Etihad", iata_code: "EY" },
                },
                {
                  departing_at: "2026-10-26T22:40:00+04:00",
                  arriving_at: "2026-10-27T09:05:00+07:00",
                  origin: { iata_code: "AUH" },
                  destination: { iata_code: "HKT" },
                  marketing_carrier: { name: "Etihad", iata_code: "EY" },
                },
              ],
            },
          ],
        },
      ],
    });

    // Prefer first→last segment elapsed (incl. layover), not a short wall-clock / bad slice claim.
    expect(result[0]?.outbound_duration).toBe("16h 35m");
    expect(result[0]?.outbound_arrive_day_offset).toBe(1);
    expect(parseDurationMinutes(result[0]?.outbound_duration ?? "")).toBeGreaterThan(12 * 60);
  });
});

describe("mergeAndRankMakeSearchFlights", () => {
  const flight = (
    partial: Partial<MakeSearchFlight> & Pick<MakeSearchFlight, "id" | "cena_eur" | "origin_iata">,
  ): MakeSearchFlight => ({
    destinacija: `${partial.origin_iata} → HKT`,
    odhod: "1. avg. 2026, 10:00",
    prevoznik: "Test Air",
    postanki: "1",
    ai_povzetek: "",
    ...partial,
  });

  it("ranks by price + travel time, not raw cheapest marathon legs", () => {
    const merged = mergeAndRankMakeSearchFlights(
      [
        flight({
          id: "vie-marathon",
          cena_eur: 517,
          origin_iata: "VIE",
          outbound_duration: "27h",
          inbound_duration: "31h 30m",
          duration_minutes: (27 + 31.5) * 60,
        }),
        flight({
          id: "mxp-sane",
          cena_eur: 603,
          origin_iata: "MXP",
          outbound_duration: "14h",
          inbound_duration: "14h 20m",
          duration_minutes: (14 + 14.333) * 60,
        }),
        flight({
          id: "vie-ok",
          cena_eur: 621,
          origin_iata: "VIE",
          outbound_duration: "13h 45m",
          inbound_duration: "14h 20m",
          duration_minutes: (13.75 + 14.333) * 60,
        }),
      ],
      { showOriginBadge: true },
    );

    expect(merged.map((f) => f.id)).toEqual(["mxp-sane", "vie-ok", "vie-marathon"]);
    expect(merged[0]?.badge).toMatch(/^best · MXP$/);
    expect(scoreMakeSearchFlight(merged[0]!)).toBeLessThan(
      scoreMakeSearchFlight(merged[2]!),
    );
  });

  it("picks strong value across origins with hub badges", () => {
    const merged = mergeAndRankMakeSearchFlights(
      [
        flight({ id: "vie-cheap", cena_eur: 420, origin_iata: "VIE", duration_minutes: 900 }),
        flight({ id: "lju-mid", cena_eur: 510, origin_iata: "LJU", duration_minutes: 800 }),
        flight({ id: "mxp-best", cena_eur: 390, origin_iata: "MXP", duration_minutes: 950 }),
        flight({ id: "vie-alt", cena_eur: 450, origin_iata: "VIE", duration_minutes: 700 }),
      ],
      { showOriginBadge: true },
    );

    expect(merged).toHaveLength(3);
    expect(merged[0]?.badge).toMatch(/^best · /);
    expect(merged.map((f) => f.id)).toContain("mxp-best");
  });

  it("dedupes identical offers before ranking", () => {
    const merged = mergeAndRankMakeSearchFlights([
      flight({ id: "same", cena_eur: 400, origin_iata: "VIE" }),
      flight({ id: "same", cena_eur: 400, origin_iata: "VIE" }),
      flight({ id: "other", cena_eur: 410, origin_iata: "LJU" }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.id).toBe("same");
  });

  it("tagMakeSearchFlightsWithOrigin fills missing hub codes", () => {
    const tagged = tagMakeSearchFlightsWithOrigin(
      [
        {
          id: "1",
          destinacija: "HKT",
          cena_eur: 500,
          odhod: "—",
          prevoznik: "X",
          postanki: "1",
          ai_povzetek: "",
          destination_iata: "HKT",
        },
      ],
      "VIE",
    );
    expect(tagged[0]?.origin_iata).toBe("VIE");
    expect(tagged[0]?.destinacija).toContain("VIE");
  });
});
