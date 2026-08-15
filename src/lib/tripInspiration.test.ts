import { describe, expect, it } from "vitest";
import {
  INSPIRATION_CARDS,
  INSPIRATION_ROTATE_MS,
  INSPIRATION_VISIBLE_COUNT,
  inspirationSlotIndex,
  msUntilNextInspirationSlot,
  pickVisibleInspirationCards,
} from "@/lib/tripInspiration";

describe("pickVisibleInspirationCards", () => {
  it("returns a stable set inside the same 4-hour window", () => {
    const start = inspirationSlotIndex(1_700_000_000_000) * INSPIRATION_ROTATE_MS;
    const a = pickVisibleInspirationCards(start).map((c) => c.id);
    const b = pickVisibleInspirationCards(start + INSPIRATION_ROTATE_MS - 1).map((c) => c.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(INSPIRATION_VISIBLE_COUNT);
    expect(new Set(a).size).toBe(INSPIRATION_VISIBLE_COUNT);
  });

  it("rotates to a different mix after 4 hours", () => {
    const start = inspirationSlotIndex(1_700_000_000_000) * INSPIRATION_ROTATE_MS;
    const a = pickVisibleInspirationCards(start).map((c) => c.id);
    const b = pickVisibleInspirationCards(start + INSPIRATION_ROTATE_MS).map((c) => c.id);
    expect(b).not.toEqual(a);
  });

  it("keeps the next-slot timer inside one rotation window", () => {
    const now = 1_700_000_000_000;
    const wait = msUntilNextInspirationSlot(now);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(INSPIRATION_ROTATE_MS);
  });

  it("has a larger pool than the visible row", () => {
    expect(INSPIRATION_CARDS.length).toBeGreaterThan(INSPIRATION_VISIBLE_COUNT);
  });
});
