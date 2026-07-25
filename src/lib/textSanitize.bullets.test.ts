import { describe, expect, it } from "vitest";
import { dedupeCrossDayBoilerplate } from "@/lib/textSanitize";

describe("dedupeCrossDayBoilerplate preserves activity bullets", () => {
  it("does not flatten multiline bullet descriptions into one paragraph", () => {
    const plan = {
      days: [
        {
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Canal cruise",
                description:
                  "- Explore the canals.\n- Learn the history.\n- Orient yourself from the water.",
                bullets: [
                  "Explore the canals.",
                  "Learn the history.",
                  "Orient yourself from the water.",
                ],
              },
            ],
            evening: [],
          },
        },
      ],
    };
    dedupeCrossDayBoilerplate(plan);
    const act = plan.days[0]!.activities!.afternoon![0]!;
    expect(act.description).toContain("\n");
    expect(act.description).toMatch(/^- Explore the canals\./m);
    expect(act.description).not.toMatch(/canals\. - Learn/);
  });
});
