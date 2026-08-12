import { afterEach, describe, expect, it } from "vitest";
import type { DuffelFlight } from "@/lib/flights.functions";
import {
  coerceParsedHeroQuery,
  defaultDateFrom,
  defaultDateTo,
  duffelFlightToMakeSearchFlight,
  isMakeFlightSearchPrimary,
  rankDuffelOffersForHero,
  shouldFallbackFromMakeToDuffel,
  type HeroFlightSearchResult,
} from "@/lib/heroFlightSearch";
import { resolveMakeFlightLegAirports } from "@/lib/flightCardRoute";
import { scoreMakeSearchFlight } from "@/lib/makeSearch";

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

describe("duffelFlightToMakeSearchFlight", () => {
  const roundTrip: DuffelFlight = {
    id: "off_rt",
    airline: "Turkish Airlines",
    airlineCode: "TK",
    price: 1437,
    currency: "EUR",
    stops: 1,
    duration: "28h",
    durationMin: 1680,
    outbound: {
      from: "VCE",
      to: "BKK",
      depart: "09:20",
      arrive: "06:40",
      date: "2026-09-12",
      duration: "14h 20m",
      durationMin: 860,
      arriveDayOffset: 1,
      stops: 1,
      airline: "Turkish Airlines",
      airlineCode: "TK",
    },
    inbound: {
      from: "BKK",
      to: "VCE",
      depart: "22:10",
      arrive: "06:05",
      date: "2026-09-26",
      duration: "13h 55m",
      durationMin: 835,
      arriveDayOffset: 1,
      stops: 1,
      airline: "Turkish Airlines",
      airlineCode: "TK",
    },
    tripKind: "roundtrip",
  };

  it("keeps return leg + airline IATA so cards are not one-way without logos", () => {
    const card = duffelFlightToMakeSearchFlight(roundTrip, "Thailand");
    expect(card.airline_iata).toBe("TK");
    expect(card.povratek).toContain("2026-09-26");
    expect(card.inbound_depart).toBe("22:10");
    expect(card.return_date).toBe("2026-09-26");
    expect(card.postanki).toBe("1/1");
    expect(resolveMakeFlightLegAirports(card).hasReturn).toBe(true);
  });

  it("keeps Duffel party total and marks price_basis for the card label", () => {
    const card = duffelFlightToMakeSearchFlight(roundTrip, "Thailand", "", { travelers: 3 });
    expect(card.cena_eur).toBe(1437);
    expect(card.price_basis).toBe("party_total");
    expect(card.travelers).toBe(3);
  });

  it("ranks by price+time score — long cheap layover loses to shorter offer", () => {
    const cheapLong: DuffelFlight = {
      ...roundTrip,
      id: "off_long",
      price: 1700,
      duration: "40h",
      durationMin: 40 * 60,
      outbound: {
        ...roundTrip.outbound,
        duration: "26h",
        durationMin: 26 * 60,
        stops: 2,
      },
      inbound: {
        ...roundTrip.inbound!,
        duration: "14h",
        durationMin: 14 * 60,
        stops: 1,
      },
    };
    const fairFaster: DuffelFlight = {
      ...roundTrip,
      id: "off_fair",
      price: 1908,
      duration: "20h 35m",
      durationMin: 20 * 60 + 35,
      outbound: {
        ...roundTrip.outbound,
        duration: "12h 30m",
        durationMin: 12 * 60 + 30,
        stops: 1,
      },
      inbound: {
        ...roundTrip.inbound!,
        duration: "8h 5m",
        durationMin: 8 * 60 + 5,
        stops: 0,
      },
    };

    const top = rankDuffelOffersForHero([cheapLong, fairFaster], "New York", 3);
    expect(top[0]?.id).toBe("off_fair");
    expect(top[0]?.badge).toMatch(/^best/);
    expect(top[0]?.cena_eur).toBe(1908);
    expect(top[0]?.price_basis).toBe("party_total");
    expect(top[0]?.travelers).toBe(3);
    expect(scoreMakeSearchFlight(top[0]!)).toBeLessThan(
      scoreMakeSearchFlight(
        duffelFlightToMakeSearchFlight(cheapLong, undefined, "", { travelers: 3 }),
      ),
    );
  });
});
