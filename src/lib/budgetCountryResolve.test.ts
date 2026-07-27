import { describe, expect, it } from "vitest";
import { resolveTripLocale } from "@/lib/tripLocale";
import {
  inferBudgetCountryFromPlace,
  resolveDayBudgetCountry,
} from "@/lib/countryDailyBudget";

describe("budget country resolution (Albania-class bugs)", () => {
  it("does not let LJU IATA override Albania destination name", () => {
    expect(resolveTripLocale("LJU", "Albania, AL", "sl").country).toBe("AL");
    expect(resolveTripLocale("LJU", "Albanija", "sl").country).toBe("AL");
    expect(resolveTripLocale("TIA", "Albania", "sl").country).toBe("AL");
    expect(resolveTripLocale("LJU", "Ljubljana", "sl").country).toBe("SI");
  });

  it("infers Turkey/Morocco/Serbia from name when IATA missing", () => {
    expect(resolveTripLocale("", "Turkey", "en").country).toBe("TR");
    expect(resolveTripLocale("", "Morocco", "en").country).toBe("MA");
    expect(resolveTripLocale("", "Serbia", "en").country).toBe("RS");
    expect(resolveTripLocale("", "Georgia", "en").country).toBe("GE");
    expect(resolveTripLocale("", "Cambodia", "en").country).toBe("KH");
  });

  it("prefers destination name over poisoned hub country in day budget resolve", () => {
    expect(
      resolveDayBudgetCountry({
        dayCity: "Coastal drive",
        destinationCountry: "SI",
        destinationName: "Albania, AL",
        destinationIata: "LJU",
      }),
    ).toBe("AL");
  });

  it("maps safari / SE Asia day cities", () => {
    expect(inferBudgetCountryFromPlace("Maasai Mara")).toBe("KE");
    expect(inferBudgetCountryFromPlace("Serengeti")).toBe("TZ");
    expect(inferBudgetCountryFromPlace("Siem Reap")).toBe("KH");
    expect(inferBudgetCountryFromPlace("Lake Skadar")).toBe("AL");
  });
});
