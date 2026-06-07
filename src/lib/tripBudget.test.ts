import { describe, expect, it } from "vitest";
import {
  applySafariBudgetFloor,
  classifyDayBudgetKind,
  computeTripTotalBudgetEur,
  dayBudgetParams,
  estimateDayBudgetEur,
  parsePriceLabelToEur,
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

describe("dayBudgetParams", () => {
  it("departure day is cheaper than sightseeing in LA", () => {
    const dep = dayBudgetParams("premium", "departure", true, 68);
    const sight = dayBudgetParams("premium", "sightseeing", true, 68);
    expect(dep.baseMealsEur).toBeLessThan(sight.baseMealsEur);
    expect(dep.localTransitEur).toBe(0);
  });
});

describe("estimateDayBudgetEur", () => {
  it("varies by listed activity prices", () => {
    const light = estimateDayBudgetEur({
      morning: [{ priceLabel: "€3" }],
      afternoon: [{ priceLabel: "brezplačno" }],
      evening: [],
    });
    const heavy = estimateDayBudgetEur({
      morning: [{ priceLabel: "€15" }, { priceLabel: "500 THB" }],
      afternoon: [{ priceLabel: "€25" }],
      evening: [{ priceLabel: "200–600 THB" }],
    });
    expect(heavy).toBeGreaterThan(light);
    expect(light).toBeLessThan(80);
  });

  it("varies between light and ticket-heavy days", () => {
    const light = estimateDayBudgetEur(
      { morning: [{ priceLabel: "brezplačno" }], afternoon: [], evening: [{ priceLabel: "35–55 €" }] },
      undefined,
      { ...dayBudgetParams("premium", "sightseeing", true, 68) },
    );
    const universal = estimateDayBudgetEur(
      { morning: [{ priceLabel: "100 €", type: "ACTIVITY" }], afternoon: [], evening: [] },
      undefined,
      { ...dayBudgetParams("premium", "ticket-heavy", true, 68) },
    );
    const departure = estimateDayBudgetEur(
      { morning: [{ type: "TRANSPORT", priceLabel: "25–50 €" }], afternoon: [], evening: [] },
      "25–50 €",
      { ...dayBudgetParams("premium", "departure", true, 68), pax: 1 },
    );
    expect(universal).toBeGreaterThan(light);
    expect(departure).toBeLessThan(light);
  });

  it("safari floor reflects lodge + park fees", () => {
    const serengeti = applySafariBudgetFloor(
      200,
      "safari",
      { morning: [{ priceLabel: "150 €", type: "ACTIVITY" }], afternoon: [], evening: [] },
    );
    expect(serengeti).toBeGreaterThanOrEqual(450);
  });

  it("balloon safari day floor is realistic", () => {
    const balloon = applySafariBudgetFloor(
      300,
      "safari-balloon",
      { morning: [{ priceLabel: "500 €", type: "ACTIVITY" }], afternoon: [], evening: [] },
    );
    expect(balloon).toBeGreaterThanOrEqual(620);
  });

  it("splits shared transport across travelers", () => {
    const solo = estimateDayBudgetEur(
      { morning: [], afternoon: [], evening: [] },
      "40–80 €",
      { pax: 1 },
    );
    const duo = estimateDayBudgetEur(
      { morning: [], afternoon: [], evening: [] },
      "40–80 €",
      { pax: 2 },
    );
    expect(duo).toBeLessThan(solo);
  });
});
