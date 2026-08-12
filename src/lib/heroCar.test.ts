import { describe, expect, it } from "vitest";
import { carPlannerFromCollected } from "@/lib/heroCar";
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
});
