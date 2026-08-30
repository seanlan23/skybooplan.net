import { describe, expect, it } from "vitest";
import {
  budgetCapMaxPerPerson,
  hotelFitsPackageBudgetCap,
  maxHotelStayEurForBudget,
  packagePricePerPersonEur,
  parseTripBudgetBand,
  resolveTripBudgetBand,
} from "@/lib/tripBudgetCap";

describe("parseTripBudgetBand", () => {
  it("reads hero chip labels including Slovenian 1000–2000", () => {
    expect(parseTripBudgetBand("1000–2000€ / osebo")).toEqual({
      minPerPerson: 1000,
      maxPerPerson: 2000,
    });
    expect(parseTripBudgetBand("€1000–2000 / person")).toEqual({
      minPerPerson: 1000,
      maxPerPerson: 2000,
    });
    expect(parseTripBudgetBand("500–1000€ / osebo")).toEqual({
      minPerPerson: 500,
      maxPerPerson: 1000,
    });
    expect(parseTripBudgetBand("Do 500€ / osebo")).toEqual({
      minPerPerson: null,
      maxPerPerson: 500,
    });
    expect(parseTripBudgetBand("2000€+ / osebo")).toEqual({
      minPerPerson: 2000,
      maxPerPerson: null,
    });
  });
});

describe("budgetCapMaxPerPerson", () => {
  it("allows +10% over the stated band and no cap for 2000+", () => {
    expect(budgetCapMaxPerPerson({ maxPerPerson: 2000 })).toBe(2200);
    expect(budgetCapMaxPerPerson({ maxPerPerson: 1000 })).toBe(1100);
    expect(budgetCapMaxPerPerson({ maxPerPerson: 500 })).toBe(550);
    expect(budgetCapMaxPerPerson({ maxPerPerson: null })).toBeNull();
  });
});

describe("package budget fit", () => {
  it("caps flight + stay per person and forbids 3397 / 4800 in the 1000–2000 band", () => {
    const cap = budgetCapMaxPerPerson({ maxPerPerson: 2000 })!;
    expect(packagePricePerPersonEur(2242, 2158, 2)).toBe(2200);
    expect(
      hotelFitsPackageBudgetCap({
        hotelStayEur: 2158,
        flightPartyEur: 2242,
        guests: 2,
        capMaxPerPerson: cap,
      }),
    ).toBe(true);
    expect(
      hotelFitsPackageBudgetCap({
        hotelStayEur: 4552,
        flightPartyEur: 2242,
        guests: 2,
        capMaxPerPerson: cap,
      }),
    ).toBe(false);
    expect(packagePricePerPersonEur(2242, 4552, 2)).toBe(3397);
    expect(packagePricePerPersonEur(2242, 7358, 2)).toBe(4800);
    expect(maxHotelStayEurForBudget({ flightPartyEur: 2242, guests: 2, capMaxPerPerson: cap })).toBe(
      2158,
    );
  });

  it("falls back to the planner tier when the label has no numbers", () => {
    expect(resolveTripBudgetBand("", "standard")).toEqual({
      minPerPerson: 500,
      maxPerPerson: 2000,
    });
  });
});
