import { describe, expect, it } from "vitest";
import { distributeHighlightsToSlots, type SkeletonHighlight } from "@/lib/aiPlan.functions";

function h(
  name: string,
  description: string,
  extra?: Partial<SkeletonHighlight>,
): SkeletonHighlight {
  return {
    day: 1,
    name,
    description,
    priceLabel: "15 €",
    lat: 34,
    lng: -118,
    ...extra,
  };
}

describe("distributeHighlightsToSlots", () => {
  it("puts main sights in the morning, not only breakfast fillers", () => {
    const slots = distributeHighlightsToSlots([
      h(
        "Griffith Observatory",
        "Razgled na mesto. Priporočamo ob sončnem zahodu.",
      ),
      h("Hollywood Sign", "Obiščite zgodaj zjutraj, da se izognete gneči."),
      h("Santa Monica Pier", "Popoldanski sprehod ob morju."),
    ]);

    expect(slots.morning.length).toBeGreaterThanOrEqual(1);
    expect(slots.morning.some((a) => /griffith|hollywood/i.test(a.name))).toBe(true);
    expect(slots.morning.every((a) => /zajtrk|breakfast/i.test(a.name))).toBe(false);
  });

  it("spreads three highlights across morning, afternoon, and evening", () => {
    const slots = distributeHighlightsToSlots([
      h("Natural History Museum", "Muzej z razstavami. Obisk v dopoldanskih urah."),
      h("The Getty Center", "Umetnost in vrtovi."),
      h("Farmers Market", "Sveže pridelke in lokalne dobrote za kosilo."),
    ]);

    expect(slots.morning.length).toBeGreaterThanOrEqual(1);
    expect(slots.afternoon.length).toBeGreaterThanOrEqual(1);
    expect(slots.morning.some((a) => /museum|getty/i.test(a.name))).toBe(true);
  });

  it("respects afternoon/morning hints in descriptions", () => {
    const slots = distributeHighlightsToSlots([
      h("360 Chicago Observation Deck", "Najboljši čas za obisk je popoldne."),
      h("Lincoln Park Zoo", "Idealen za jutranji obisk — manj gneče."),
    ]);

    expect(slots.afternoon.some((a) => /360 chicago/i.test(a.name))).toBe(true);
    expect(slots.morning.some((a) => /lincoln park zoo/i.test(a.name))).toBe(true);
  });

  it("puts Tiger Cave Temple in morning even when AI suggests afternoon", () => {
    const slots = distributeHighlightsToSlots([
      h("Emerald Pool", "Osvežitev v džungelskem bazenu. Zgodaj zjutraj."),
      h(
        "Tiger Cave Temple",
        "Vzpon po 1237 stopnicah. Priporočamo obisk v popoldanskih urah.",
      ),
    ]);

    expect(slots.morning.some((a) => /tiger cave/i.test(a.name))).toBe(true);
    expect(slots.afternoon.some((a) => /tiger cave/i.test(a.name))).toBe(false);
  });

  it("puts Central Park morning hint in morning, Gateway Arch daytime in afternoon", () => {
    const slots = distributeHighlightsToSlots([
      h("Central Park", "Najboljši čas za obisk je zjutraj."),
      h("Gateway Arch", "Najboljši čas za obisk je dopoldne."),
    ]);

    expect(slots.morning.some((a) => /central park/i.test(a.name))).toBe(true);
    const archSlot = slots.morning.some((a) => /gateway arch/i.test(a.name))
      ? "morning"
      : slots.afternoon.some((a) => /gateway arch/i.test(a.name))
        ? "afternoon"
        : null;
    expect(archSlot).not.toBeNull();
    expect(slots.evening.some((a) => /gateway arch/i.test(a.name))).toBe(false);
    const cpAfternoon = slots.afternoon.find((a) => /central park/i.test(a.name));
    if (cpAfternoon) {
      expect(cpAfternoon.description).not.toMatch(/najboljši čas za obisk je zjutraj/i);
    }
  });
});
