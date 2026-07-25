import { describe, expect, it } from "vitest";
import {
  dedupeSameDayActivities,
  dedupeCrossDayBoilerplate,
  stripArrivalLabelSpam,
} from "@/lib/textSanitize";

describe("stripArrivalLabelSpam", () => {
  it("removes long +1 dan arrival labels", () => {
    const out = stripArrivalLabelSpam(
      "Pristanek ob 17:55 (+1 dan od odhoda, lokalni čas na destinaciji) in transfer.",
    );
    expect(out).not.toMatch(/\+1 dan/);
    expect(out).toMatch(/17:55/);
  });
});

describe("dedupeCrossDayBoilerplate", () => {
  it("keeps first Grab sentences then drops repeats", () => {
    const plan = {
      days: [
        {
          transportationTips: "V Bangkok z Grabom. Če imaš še energijo, sprehod.",
          activities: {
            morning: [{ description: "Grab nazaj v hotel zvečer." }],
            afternoon: [],
            evening: [],
          },
        },
        {
          transportationTips: "V Bangkok z Grabom. Če imaš še energijo, sprehod.",
          activities: {
            morning: [{ description: "Grab nazaj v hotel zvečer." }],
            afternoon: [],
            evening: [],
          },
        },
        {
          transportationTips: "V Bangkok z Grabom. Če imaš še energijo, sprehod.",
          activities: {
            morning: [{ description: "Grab nazaj v hotel zvečer." }],
            afternoon: [],
            evening: [],
          },
        },
      ],
    };
    dedupeCrossDayBoilerplate(plan);
    const grabs = plan.days
      .map((d) => `${d.transportationTips} ${d.activities?.morning?.[0]?.description}`)
      .join("\n");
    const grabHits = grabs.match(/Grab/gi) ?? [];
    expect(grabHits.length).toBeLessThan(6);
  });
});

describe("dedupeSameDayActivities", () => {
  it("keeps one Gastown activity when afternoon titles are near-duplicates", () => {
    const plan = {
      days: [
        {
          activities: {
            morning: [],
            afternoon: [
              {
                name: "Afternoon Lunch and Wander in Gastown",
                description: "Lunch then stroll.",
              },
              {
                name: "Afternoon Explore Gastown's Historic Streets",
                description: "Same neighbourhood again.",
              },
            ],
            evening: [],
          },
        },
      ],
    };
    dedupeSameDayActivities(plan);
    expect(plan.days[0]!.activities!.afternoon).toHaveLength(1);
    expect(plan.days[0]!.activities!.afternoon![0]!.name).toMatch(/Lunch and Wander/i);
  });
});
