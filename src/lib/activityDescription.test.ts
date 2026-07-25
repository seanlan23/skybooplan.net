import { describe, expect, it } from "vitest";
import {
  coerceActivityDescriptionFields,
  formatActivityDescription,
  normalizeActivityBullets,
} from "@/lib/activityDescription";

describe("normalizeActivityBullets", () => {
  it("prefers explicit bullets[]", () => {
    const out = normalizeActivityBullets({
      description: "ignored wall",
      bullets: ["Book a table early", "Try the local pie"],
    });
    expect(out).toEqual(["Book a table early", "Try the local pie"]);
  });

  it("splits Katoomba-style evening wall of text into short bullets", () => {
    const wall =
      "For dinner in Katoomba head to a cozy bistro near the Echo Point lookout and order seasonal Blue Mountains produce with a local wine pairing while watching the mist roll in over the Jamison Valley as the sun sets behind the Three Sisters sandstone cliffs which look spectacular at dusk especially if you walk the short path from the visitor centre first and then grab dessert at the bakery that stays open late for hikers returning from Wentworth Falls.";
    const out = normalizeActivityBullets({ description: wall });
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(4);
    expect(out.every((b) => b.length <= 140)).toBe(true);
    // Must not remain a single unbroken paragraph.
    expect(formatActivityDescription(out)).toContain("\n");
  });

  it("keeps already-formatted newline bullets", () => {
    const out = normalizeActivityBullets({
      description: "- Short walk to Echo Point\n- Dinner at a Katoomba bistro\n- Early night after Blue Mountains day",
    });
    expect(out).toHaveLength(3);
    expect(out[0]).toMatch(/Echo Point/i);
  });
});

describe("coerceActivityDescriptionFields", () => {
  it("syncs description from bullets for Zod payload", () => {
    const a: Record<string, unknown> = {
      title: "Katoomba dinner",
      description:
        "A very long unformatted paragraph about dinner in Katoomba that goes on and on with no line breaks at all about wine and mist and Three Sisters and bakery dessert for hikers returning late from the falls after a huge day of walking.",
      category: "food",
      timeSlot: "vecer",
    };
    coerceActivityDescriptionFields(a);
    expect(Array.isArray(a.bullets)).toBe(true);
    expect((a.bullets as string[]).length).toBeGreaterThanOrEqual(2);
    expect(String(a.description)).toMatch(/^- /m);
    expect(formatActivityDescription(a.bullets as string[])).toBe(a.description);
  });
});
