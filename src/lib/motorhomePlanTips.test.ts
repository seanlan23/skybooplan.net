import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { enrichMotorhomePlanTips } from "@/lib/motorhomePlanTips";

describe("enrichMotorhomePlanTips", () => {
  it("fixes Titova jama and adds Ferragosto tip", () => {
    const plan = {
      groundTransportMode: "motorhome",
      days: [
        {
          day: 1,
          date: "2026-08-15",
          city: "Venice",
          title: "Benetke",
          morning: "",
          afternoon: "",
          evening: "",
          transportationTips: "Trajekt iz Fusina.",
          activities: {
            morning: [
              {
                name: "Titova jama",
                type: "SIGHT",
                description: "Ogled Titove jame pri Sperlongi.",
              },
            ],
          },
        },
        {
          day: 2,
          date: "2026-08-29",
          city: "Trieste",
          title: "Vožnja",
          morning: "",
          afternoon: "",
          evening: "",
          drivingDistanceKm: 450,
          transportationTips: "",
          activities: {},
        },
      ],
    } as AiTripPlan;

    enrichMotorhomePlanTips(plan, "sl");
    expect(plan.days[0]!.activities!.morning![0]!.name).toMatch(/Tiberijeva|Villa di Tiberio/i);
    expect(plan.days[0]!.transportationTips).toMatch(/Ferragosto|rezerviraj/i);
    expect(plan.days[1]!.transportationTips).toMatch(/450|zastoj|A14/i);
  });
});
