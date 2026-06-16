import { describe, expect, it } from "vitest";
import {
  coerceParsedHeroQuery,
  defaultDateFrom,
  defaultDateTo,
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
