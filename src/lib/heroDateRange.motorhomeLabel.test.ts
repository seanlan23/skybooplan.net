import { describe, expect, it } from "vitest";
import { parseHeroDateRange } from "@/lib/heroDateRange";
import { parseChatDateRange } from "@/lib/heroChatPlanner";
import { motorhomePlannerFromCollected } from "@/lib/heroMotorhome";
import { generateGeminiProTripInputSchema } from "@/lib/geminiPro.functions";
import { formatPlannerInterests } from "@/lib/plannerInterests";

describe("motorhome Vienna→Croatia validation", () => {
  it("parses screenshot-style SL date label", () => {
    const label = "14. avg → 24. avg 2026";
    expect(parseHeroDateRange(label, "sl")?.departDate).toBe("2026-08-14");
    expect(parseChatDateRange(label, "sl").returnDate).toBe("2026-08-24");
  });

  it("accepts full priority set without customWishes overflow", () => {
    const { ctx, form } = motorhomePlannerFromCollected(
      {
        origin: "Vienna",
        destination: "Croatia",
        dates: "14. avg → 24. avg 2026",
        nights: "",
        passengers: "2 odrasli",
        pace: "relaxed",
        budget: "500–1000€",
        priorities: [
          "beaches",
          "mountains",
          "nature",
          "rivers",
          "hikes",
          "food",
          "culture",
        ],
      },
      "sl",
    );
    const priorities = [formatPlannerInterests(form.tags ?? [], "sl")];
    const customWishes = [
      form.wishes,
      `Proračun: Standard.`,
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 2400);

    const parsed = generateGeminiProTripInputSchema.safeParse({
      originIata: ctx.from,
      destinationIata: ctx.to,
      departDate: ctx.departDate,
      returnDate: ctx.returnDate,
      pax: { adults: ctx.adults, childrenAges: ctx.childrenAges },
      budget: form.budget ?? "standard",
      wishTags: [],
      customWishes,
      pace: form.pace,
      priorities,
      groundTransportMode: "motorhome",
      originPlace: ctx.originPlace,
      destinationPlace: ctx.destinationPlace,
      language: "sl",
    });
    expect(parsed.success).toBe(true);
  });
});
