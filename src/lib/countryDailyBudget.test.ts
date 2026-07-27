import { describe, expect, it } from "vitest";
import {
  COUNTRY_MID_DAILY_EUR,
  countryMidDailyBudgetEur,
  countryTierDailyBudgetEur,
  inferBudgetCountryFromPlace,
  priceTierFromCountryMid,
  resolveDayBudgetCountry,
} from "@/lib/countryDailyBudget";

describe("countryDailyBudget", () => {
  it("covers the top-80 mid-range table anchors", () => {
    expect(Object.keys(COUNTRY_MID_DAILY_EUR).length).toBeGreaterThanOrEqual(80);
    expect(countryMidDailyBudgetEur("FR")).toBe(130);
    expect(countryMidDailyBudgetEur("ES")).toBe(120);
    expect(countryMidDailyBudgetEur("US")).toBe(180);
    expect(countryMidDailyBudgetEur("CH")).toBe(200);
    expect(countryMidDailyBudgetEur("NO")).toBe(170);
    expect(countryMidDailyBudgetEur("IS")).toBe(190);
    expect(countryMidDailyBudgetEur("PT")).toBe(90);
    expect(countryMidDailyBudgetEur("SI")).toBe(85);
  });

  it("scales budget/premium off mid", () => {
    expect(countryTierDailyBudgetEur("IT", "budget")).toBe(Math.round(130 * 0.7));
    expect(countryTierDailyBudgetEur("IT", "mid")).toBe(130);
    expect(countryTierDailyBudgetEur("IT", "premium")).toBe(Math.round(130 * 1.45));
    expect(countryTierDailyBudgetEur("CH", "budget")).toBe(Math.round(200 * 0.7));
    expect(countryTierDailyBudgetEur("AL", "budget")).toBe(Math.round(50 * 0.7));
  });

  it("maps mid daily to coarse price tiers", () => {
    expect(priceTierFromCountryMid("CH")).toBe("premium");
    expect(priceTierFromCountryMid("DK")).toBe("premium");
    expect(priceTierFromCountryMid("IT")).toBe("mid");
    expect(priceTierFromCountryMid("AL")).toBe("budget");
    expect(priceTierFromCountryMid("TH")).toBe("budget");
  });

  it("resolves road-trip day cities to the right budget country", () => {
    expect(inferBudgetCountryFromPlace("Berat")).toBe("AL");
    expect(inferBudgetCountryFromPlace("Plitvice Lakes National Park")).toBe("HR");
    expect(inferBudgetCountryFromPlace("Kotor")).toBe("ME");
    expect(inferBudgetCountryFromPlace("Shkoder")).toBe("AL");
    expect(inferBudgetCountryFromPlace("Saranda")).toBe("AL");
    expect(resolveDayBudgetCountry({ dayCity: "Berat", destinationCountry: "XX" })).toBe(
      "AL",
    );
    expect(
      resolveDayBudgetCountry({
        destinationCountry: "XX",
        destinationName: "Albania, AL",
      }),
    ).toBe("AL");
  });
});
