import { describe, expect, it } from "vitest";
import { lookupDestination } from "@/lib/destinationCoords";
import { resolveTripLocale, getPriceTier } from "@/lib/tripLocale";
import { countryMidDailyBudgetEur, resolveDayBudgetCountry } from "@/lib/countryDailyBudget";
import {
  applyGlobalDayBudgetCeil,
  applyValueDestinationDayBudgetCeil,
  applyCountryDayBudgetCeil,
  applyMotorhomeBudgetCeil,
  applyMotorhomeBudgetFloor,
  applySafariBudgetFloor,
  applyUsBudgetFloor,
  classifyDayBudgetKind,
  computeTripTotalBudgetEur,
  dayBudgetParams,
  estimateDayBudgetEur,
  hasCountryMidDailyBudget,
  isValueDestinationBudget,
  normalizeGeminiDailyBudgetPerPerson,
  normalizeMotorhomeDailyBudgetPerPerson,
  parsePriceLabelToEur,
  scaleDailyBudgetsToTripCap,
} from "@/lib/tripBudget";

describe("parsePriceLabelToEur", () => {
  it("parses EUR and THB ranges", () => {
    expect(parsePriceLabelToEur("€15")).toBe(15);
    expect(parsePriceLabelToEur("35–55 €")).toBe(45);
    expect(parsePriceLabelToEur("200–500 THB")).toBeGreaterThan(5);
    expect(parsePriceLabelToEur("brezplačno")).toBe(0);
  });
});

describe("classifyDayBudgetKind", () => {
  it("marks departure and ticket-heavy days differently", () => {
    expect(
      classifyDayBudgetKind(
        { morning: [{ type: "TRANSPORT", priceLabel: "25 €" }], afternoon: [], evening: [] },
        { isArrival: false, isDeparture: true },
      ),
    ).toBe("departure");
    expect(
      classifyDayBudgetKind(
        {
          morning: [{ type: "ACTIVITY", priceLabel: "100 €", name: "Universal" }],
          afternoon: [],
          evening: [],
        },
        { isArrival: false, isDeparture: false },
      ),
    ).toBe("ticket-heavy");
  });

  it("does not treat dinner-heavy Sri Lanka days as ticket-heavy", () => {
    expect(
      classifyDayBudgetKind(
        {
          morning: [{ type: "ACTIVITY", priceLabel: "€12", name: "Temple" }],
          afternoon: [{ type: "EAT", priceLabel: "€18", name: "Seafood lunch" }],
          evening: [{ type: "EAT", priceLabel: "€25", name: "Dinner" }],
        },
        { isArrival: false, isDeparture: false, regionCity: "Galle" },
      ),
    ).toBe("sightseeing");
  });
});

describe("industry country mid daily budgets", () => {
  it("differentiates CH / NO / FR / IT / AL / TH", () => {
    expect(countryMidDailyBudgetEur("CH")).toBe(200);
    expect(countryMidDailyBudgetEur("NO")).toBe(170);
    expect(countryMidDailyBudgetEur("IS")).toBe(190);
    expect(countryMidDailyBudgetEur("FR")).toBe(130);
    expect(countryMidDailyBudgetEur("IT")).toBe(130);
    expect(countryMidDailyBudgetEur("ES")).toBe(120);
    expect(countryMidDailyBudgetEur("PT")).toBe(90);
    expect(countryMidDailyBudgetEur("AL")).toBe(50);
    expect(countryMidDailyBudgetEur("TH")).toBe(50);
    expect(getPriceTier("CH")).toBe("premium");
    expect(getPriceTier("NO")).toBe("premium");
    expect(getPriceTier("IT")).toBe("mid");
    expect(getPriceTier("AL")).toBe("budget");
  });

  it("caps Italy at €130 mid and Switzerland at €200", () => {
    expect(
      applyCountryDayBudgetCeil(300, "sightseeing", "mid", { country: "IT" }),
    ).toBe(130);
    expect(
      applyCountryDayBudgetCeil(300, "sightseeing", "mid", { country: "CH" }),
    ).toBe(200);
    expect(
      applyCountryDayBudgetCeil(300, "sightseeing", "mid", { country: "NO" }),
    ).toBe(170);
  });

  it("keeps 3-pax Thailand totals under control via country mid €50", () => {
    const days = Array.from({ length: 16 }, () =>
      applyCountryDayBudgetCeil(200, "sightseeing", "mid", {
        country: "TH",
        city: "Phuket",
      }),
    );
    expect(days[0]).toBe(50);
    expect(computeTripTotalBudgetEur(days.map((d) => ({ dailyBudgetEur: d })), 3)).toBeLessThan(
      3000,
    );
  });

  it("keeps 3-pax Albania car-trip totals near Thailand money not WE (€4596 LJU PDF)", () => {
    expect(lookupDestination("TIA")?.country).toBe("AL");
    expect(resolveTripLocale("", "Albania, AL", "sl").country).toBe("AL");
    expect(hasCountryMidDailyBudget("AL")).toBe(true);

    // Route mix like LJU-3.pdf: Plitvice(HR) + Berat/Saranda(AL) + Kotor(ME) + LJU(SI)
    const route = [
      "Plitvice",
      "Plitvice",
      "Shkoder",
      "Shkoder",
      "Berat",
      "Berat",
      "Saranda",
      "Saranda",
      "Saranda",
      "Saranda",
      "Kotor",
      "Kotor",
      "Ljubljana",
      "Ljubljana",
    ];
    const days = route.map((city) => {
      const cc = resolveDayBudgetCountry({
        dayCity: city,
        destinationCountry: "AL",
        destinationName: "Albania, AL",
      });
      let d = applyCountryDayBudgetCeil(200, "sightseeing", "mid", {
        country: cc,
        city,
      });
      d = applyValueDestinationDayBudgetCeil(d, "sightseeing", "mid", {
        country: cc,
        city,
      });
      return d;
    });
    const total = computeTripTotalBudgetEur(
      days.map((d) => ({ dailyBudgetEur: d })),
      3,
    );
    // Was €4596 (~€109/pp/day). Thailand mid €50×14×3 = €2100 — Balkans must stay in that band.
    expect(total).toBeLessThanOrEqual(2800);
    expect(days.filter((_, i) => i >= 2 && i <= 9).every((d) => d <= 50)).toBe(true);
  });

  it("Italy 21d mid tracks industry €130/pp/day (≈€8.2k for 3 with hotels)", () => {
    expect(lookupDestination("FCO")?.country).toBe("IT");
    expect(resolveTripLocale("FCO", "Italy", "sl").country).toBe("IT");
    const days = Array.from({ length: 21 }, () =>
      applyCountryDayBudgetCeil(200, "sightseeing", "mid", {
        country: "IT",
        city: "Florence Italy FCO",
      }),
    );
    expect(days[0]).toBe(130);
    // Industry mid includes shared 3★ lodging — not the old €4.5k undercut.
    expect(computeTripTotalBudgetEur(days.map((d) => ({ dailyBudgetEur: d })), 3)).toBe(8190);
  });
});

describe("applyValueDestinationDayBudgetCeil", () => {
  it("tightens Phuket sightseeing but leaves NYC alone", () => {
    expect(
      applyValueDestinationDayBudgetCeil(165, "sightseeing", "mid", {
        country: "TH",
        city: "Phuket",
      }),
    ).toBe(75);
    expect(
      applyValueDestinationDayBudgetCeil(165, "sightseeing", "mid", {
        country: "US",
        city: "New York",
      }),
    ).toBe(165);
  });
});

describe("applyGlobalDayBudgetCeil + US floor", () => {
  it("still allows US-floor NYC sightseeing under mid ceil", () => {
    const floored = applyUsBudgetFloor(
      90,
      "sightseeing",
      {
        morning: [{ priceLabel: "€22" }],
        afternoon: [{ priceLabel: "€40" }],
        evening: [{ priceLabel: "€80", name: "Dinner and cocktails" }],
      },
      "New York",
      "US",
    );
    expect(floored).toBeGreaterThanOrEqual(150);
    expect(applyGlobalDayBudgetCeil(floored, "sightseeing", "mid")).toBeGreaterThanOrEqual(150);
    expect(applyGlobalDayBudgetCeil(floored, "sightseeing", "mid")).toBeLessThanOrEqual(165);
  });
});

describe("normalizeGeminiDailyBudgetPerPerson", () => {
  it("splits household Gemini totals for groups", () => {
    expect(normalizeGeminiDailyBudgetPerPerson(380, 88, 90, 4)).toBeLessThanOrEqual(100);
    expect(normalizeGeminiDailyBudgetPerPerson(380, 88, 90, 4)).toBeGreaterThanOrEqual(90);
    expect(normalizeGeminiDailyBudgetPerPerson(420, 100, 120, 4)).toBeLessThanOrEqual(130);
  });

  it("keeps already-pp figures", () => {
    expect(normalizeGeminiDailyBudgetPerPerson(75, 70, 50, 2)).toBe(75);
  });

  it("does not undercut high computed floors", () => {
    expect(normalizeGeminiDailyBudgetPerPerson(110, 180, 130, 3)).toBeGreaterThanOrEqual(180);
  });
});

describe("computeTripTotalBudgetEur", () => {
  it("sums daily per-person budgets times travelers", () => {
    expect(
      computeTripTotalBudgetEur(
        [{ dailyBudgetEur: 450 }, { dailyBudgetEur: 620 }],
        2,
      ),
    ).toBe(2140);
  });
});

describe("scaleDailyBudgetsToTripCap", () => {
  it("does not crush Italy below industry mid × days", () => {
    const days = Array.from({ length: 21 }, (_, i) => ({
      dailyBudgetEur: i === 0 || i === 20 ? 55 : 140,
    }));
    scaleDailyBudgetsToTripCap(days, "mid", { country: "IT" });
    const after = days.reduce((s, d) => s + (d.dailyBudgetEur ?? 0), 0);
    // Industry IT €130 × 21 = 2730; +12% headroom ≈ 3058 — do not force ≤2000.
    expect(after).toBeGreaterThanOrEqual(2500);
    expect(after).toBeLessThanOrEqual(Math.round(130 * 21 * 1.12) + 5);
  });

  it("trims only absurd inflation above industry +12%", () => {
    const days = Array.from({ length: 10 }, () => ({ dailyBudgetEur: 200 }));
    scaleDailyBudgetsToTripCap(days, "mid", { country: "IT" });
    const after = days.reduce((s, d) => s + (d.dailyBudgetEur ?? 0), 0);
    expect(after).toBeLessThanOrEqual(Math.round(130 * 10 * 1.12) + 5);
  });

  it("leaves short mid trips under industry envelope untouched", () => {
    const days = [{ dailyBudgetEur: 120 }, { dailyBudgetEur: 150 }, { dailyBudgetEur: 90 }];
    scaleDailyBudgetsToTripCap(days, "mid", { country: "IT" });
    expect(days.map((d) => d.dailyBudgetEur)).toEqual([120, 150, 90]);
  });

  it("does not cap premium", () => {
    const days = Array.from({ length: 21 }, () => ({ dailyBudgetEur: 180 }));
    scaleDailyBudgetsToTripCap(days, "premium", { country: "IT" });
    expect(days[0]!.dailyBudgetEur).toBe(180);
  });
});

describe("normalizeMotorhomeDailyBudgetPerPerson", () => {
  it("splits household motorhome dailies", () => {
    expect(normalizeMotorhomeDailyBudgetPerPerson(240, 60, 3)).toBeLessThanOrEqual(100);
  });
});

describe("motorhome floor/ceil", () => {
  it("keeps motorhome days in band", () => {
    expect(applyMotorhomeBudgetFloor(20, "sightseeing", 2)).toBeGreaterThanOrEqual(35);
    expect(applyMotorhomeBudgetCeil(180, "sightseeing")).toBeLessThanOrEqual(100);
  });
});

describe("dayBudgetParams + estimateDayBudgetEur", () => {
  it("estimates from activities", () => {
    const params = dayBudgetParams("mid", "sightseeing", false, 45);
    const eur = estimateDayBudgetEur(
      {
        morning: [{ priceLabel: "€20" }],
        afternoon: [{ priceLabel: "€15" }],
        evening: [{ priceLabel: "€30", type: "EAT" }],
      },
      undefined,
      { ...params, pax: 2 },
    );
    expect(eur).toBeGreaterThan(50);
  });
});

describe("applySafariBudgetFloor", () => {
  it("floors safari days above thin estimates", () => {
    expect(
      applySafariBudgetFloor(100, "safari", {
        morning: [{ name: "Game drive", priceLabel: "€80" }],
        afternoon: [],
        evening: [],
      }),
    ).toBeGreaterThan(100);
  });
});

describe("isValueDestinationBudget", () => {
  it("flags Balkans and SE Asia", () => {
    expect(isValueDestinationBudget("AL", "Tirana")).toBe(true);
    expect(isValueDestinationBudget("TH", "Phuket")).toBe(true);
    expect(isValueDestinationBudget("US", "NYC")).toBe(false);
  });
});
