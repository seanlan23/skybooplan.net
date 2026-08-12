import { describe, expect, it } from "vitest";
import { carPlannerFromCollected, plannerWishesForDisplay } from "@/lib/heroCar";
import type { HeroChatCollected } from "@/lib/heroChatFlow";

describe("carPlannerFromCollected", () => {
  it("sets car ground mode and hotel wishes without camps", () => {
    const collected: HeroChatCollected = {
      origin: "Ljubljana",
      destination: "Barcelona",
      dates: "2026-08-01 – 2026-08-10",
      nights: "",
      passengers: "2 adults",
      pace: "relaxed",
      budget: "500–1000€",
      priorities: ["beaches", "cities"],
    };
    const { ctx, form } = carPlannerFromCollected(collected, "sl");
    expect(ctx.groundTransportMode).toBe("car");
    expect(ctx.originPlace).toMatch(/Ljubljana/i);
    expect(ctx.destinationPlace).toMatch(/Barcelona/i);
    expect(form.wishes).toMatch(/AVTOM|avtom/i);
    expect(form.wishes).toMatch(/hotel/i);
    expect(form.wishes).toMatch(/PREPOVEDANO[\s\S]*kamp/i);
    expect(form.wishes).not.toMatch(/predlagane kampe/i);
  });

  it("includes free-text places and wishes in the planner prompt", () => {
    const { form } = carPlannerFromCollected(
      {
        origin: "Vienna",
        destination: "Croatia",
        dates: "2026-09-02 – 2026-09-12",
        nights: "",
        passengers: "2 adults",
        pace: "relaxed",
        budget: "500–1000€",
        priorities: ["beaches"],
        locationWishes: "Plitvice, Split old town",
      },
      "en",
    );
    expect(form.wishes).toMatch(/Plitvice/);
    expect(form.wishes).toMatch(/Split old town/);
    expect(form.wishes).toMatch(/Places \/ sights \/ wishes/i);
  });

  it("does not treat Balkan as Turkmenistan", () => {
    const { ctx } = carPlannerFromCollected(
      {
        origin: "Črna na Koroškem, SI",
        destination: "Balkan, TM",
        dates: "2026-09-02 – 2026-09-12",
        nights: "",
        passengers: "2 adults",
        pace: "relaxed",
        budget: "500–1000€",
        priorities: ["beaches"],
        locationWishes: "bosna, črna gora, albanija",
      },
      "en",
    );
    expect(ctx.destinationPlace).toBe("Balkan");
    expect(ctx.destinationPlace).not.toMatch(/TM/);
  });
});

describe("plannerWishesForDisplay", () => {
  it("keeps only the places the traveller asked for", () => {
    const blob =
      "Car road trip — not by plane, not by motorhome. Start: Črna na Koroškem, SI. Destination / direction: Balkan, TM. dates: 2026-09-02 – 2026-09-12. 2 adults Priorities: dream beaches. Places / sights / wishes (include on the route where sensible; feel free to add new suggestions too): bosna, črna gora, albanija. Overnights = hotels in cities every night (Booking). FORBIDDEN: camps.";
    expect(plannerWishesForDisplay(blob)).toMatch(/bosna/i);
    expect(plannerWishesForDisplay(blob)).not.toMatch(/Turkmen|TM|FORBIDDEN|Start:/i);
  });
});
