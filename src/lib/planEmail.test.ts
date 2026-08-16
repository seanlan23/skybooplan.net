import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import { buildPlanEmail } from "@/lib/planEmail";

describe("buildPlanEmail", () => {
  it("builds a compact Slovenian itinerary mail", () => {
    const mail = buildPlanEmail(
      {
        destinationName: "Francija",
        contentLanguage: "sl",
        days: [
          {
            day: 1,
            date: "2026-09-20",
            city: "Paris",
            title: "Prihod",
            activities: {
              morning: [{ name: "Na letališču VIE" }],
              evening: [{ name: "Latinska četrt" }],
            },
          },
          {
            day: 2,
            date: "2026-09-21",
            city: "Paris",
            title: "Ikone",
            activities: {
              morning: [{ name: "Eifflov stolp" }],
              afternoon: [{ name: "Louvre" }],
            },
          },
        ],
      } as AiTripPlan,
      { title: "VIE → CDG", language: "sl" },
    );
    expect(mail.subject).toMatch(/VIE → CDG/);
    expect(mail.subject).toMatch(/2026-09-20/);
    expect(mail.body).toMatch(/Dan 1 · Paris/);
    expect(mail.body).toMatch(/Eifflov stolp/);
    expect(mail.body).toMatch(/Prenosih/);
    expect(mail.body.length).toBeLessThan(2000);
  });
});
