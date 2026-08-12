import { afterEach, describe, expect, it } from "vitest";
import {
  coerceParsedHeroQuery,
  defaultDateFrom,
  defaultDateTo,
  isMakeFlightSearchPrimary,
  shouldFallbackFromMakeToDuffel,
  type HeroFlightSearchResult,
} from "@/lib/heroFlightSearch";

describe("coerceParsedHeroQuery", () => {
  it("normalizes OpenAI-style payload with defaults", () => {
    const parsed = coerceParsedHeroQuery({
      origin_iata: "lju",
      destination_iata: "nrt",
      date_from: "2026-10-20",
      adults: 2,
      destination_name: "Tokio, Japonska",
    });

    expect(parsed).toMatchObject({
      origin_iata: "LJU",
      destination_iata: "NRT",
      depart_date: "2026-10-20",
      adults: 2,
      trip_type: "oneway",
    });
  });

  it("defaults origin to LJU when missing", () => {
    const parsed = coerceParsedHeroQuery({
      destination_iata: "BCN",
      date_from: "2026-07-01",
    });

    expect(parsed?.origin_iata).toBe("LJU");
    expect(parsed?.destination_iata).toBe("BCN");
  });

  it("returns null when destination IATA is invalid", () => {
    expect(coerceParsedHeroQuery({ destination_iata: "XX" })).toBeNull();
    expect(coerceParsedHeroQuery(null)).toBeNull();
  });

  it("detects return trip from date_to", () => {
    const parsed = coerceParsedHeroQuery({
      destination_iata: "LHR",
      date_from: "2026-08-01",
      date_to: "2026-08-10",
    });

    expect(parsed?.trip_type).toBe("return");
    expect(parsed?.return_date).toBe("2026-08-10");
  });

  it("applies 3-month + 7-day defaults when dates omitted", () => {
    const parsed = coerceParsedHeroQuery({
      destination_iata: "DPS",
      destination_name: "Bali",
    });

    expect(parsed?.depart_date).toBe(defaultDateFrom());
    expect(parsed?.return_date).toBe(defaultDateTo(defaultDateFrom()));
    expect(parsed?.trip_type).toBe("return");
  });
});

describe("Make vs Duffel routing helpers", () => {
  const prevPrimary = process.env.MAKE_FLIGHT_SEARCH_PRIMARY;

  afterEach(() => {
    if (prevPrimary == null) delete process.env.MAKE_FLIGHT_SEARCH_PRIMARY;
    else process.env.MAKE_FLIGHT_SEARCH_PRIMARY = prevPrimary;
  });

  it("defaults to direct Duffel (Make not primary)", () => {
    delete process.env.MAKE_FLIGHT_SEARCH_PRIMARY;
    expect(isMakeFlightSearchPrimary()).toBe(false);
    process.env.MAKE_FLIGHT_SEARCH_PRIMARY = "0";
    expect(isMakeFlightSearchPrimary()).toBe(false);
  });

  it("enables Make primary only for 1/true/yes", () => {
    process.env.MAKE_FLIGHT_SEARCH_PRIMARY = "1";
    expect(isMakeFlightSearchPrimary()).toBe(true);
    process.env.MAKE_FLIGHT_SEARCH_PRIMARY = "true";
    expect(isMakeFlightSearchPrimary()).toBe(true);
  });

  it("falls back from Make on error or empty flights, not pending", () => {
    const err: HeroFlightSearchResult = { ok: false, error: "x", status: 502 };
    expect(shouldFallbackFromMakeToDuffel(err)).toBe(true);

    const empty: HeroFlightSearchResult = {
      ok: true,
      flights: [],
      parsed: {
        origin_iata: "VIE",
        destination_iata: "CGK",
        depart_date: "2026-09-20",
        return_date: "2026-09-27",
        adults: 2,
        trip_type: "return",
      },
    };
    expect(shouldFallbackFromMakeToDuffel(empty)).toBe(true);

    const pending: HeroFlightSearchResult = {
      ok: true,
      pending: true,
      searchId: "s1",
    };
    expect(shouldFallbackFromMakeToDuffel(pending)).toBe(false);

    const ok: HeroFlightSearchResult = {
      ok: true,
      flights: [
        {
          id: "o1",
          destinacija: "Jakarta",
          cena_eur: 500,
          odhod: "2026-09-20, 10:00",
          prevoznik: "OS",
          postanki: "0",
          ai_povzetek: "",
        },
      ],
      parsed: empty.parsed,
    };
    expect(shouldFallbackFromMakeToDuffel(ok)).toBe(false);
  });
});
