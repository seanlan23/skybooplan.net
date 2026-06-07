import { describe, expect, it } from "vitest";
import { ensureBangkokMustSee, ensureTripBangkokMustSeeHighlights } from "@/lib/bangkokMustSee";
import type { TripRegion } from "@/lib/aiPlan.functions";
import { resolveTripLocale } from "@/lib/tripLocale";

const locale = resolveTripLocale("BKK", "Tajska", "sl");

describe("ensureBangkokMustSee", () => {
  it("adds Grand Palace morning, Wat Arun evening — not temples in afternoon", () => {
    const out = ensureBangkokMustSee(
      {
        morning: [{ name: "Jim Thompson House", type: "SIGHT", description: "Muzej." }],
        afternoon: [],
        evening: [],
      },
      locale,
      { dayInRegion: 2 },
    );
    expect(out.morning.some((a) => /grand palace/i.test(a.name))).toBe(true);
    expect(out.morning.some((a) => /wat pho/i.test(a.name))).toBe(true);
    expect(out.evening.some((a) => /wat arun/i.test(a.name))).toBe(true);
    expect(out.evening.some((a) => /asiatique|chao phraya/i.test(a.name))).toBe(true);
    expect(out.afternoon.some((a) => /wat |palace|temple/i.test(a.name))).toBe(false);
  });

  it("does not duplicate icons already scheduled on earlier days", () => {
    const out = ensureBangkokMustSee(
      { morning: [], afternoon: [], evening: [] },
      locale,
      {
        priorScheduledText: "Grand Palace in Wat Pho obisk Wat Arun sončni zahod",
        dayInRegion: 2,
      },
    );
    expect(out.morning.filter((a) => /grand palace|wat pho/i.test(a.name)).length).toBe(0);
    expect(out.evening.filter((a) => /wat arun/i.test(a.name)).length).toBe(0);
  });

  it("still injects Grand Palace when Wat Pho was only on arrival evening", () => {
    const out = ensureBangkokMustSee(
      {
        morning: [{ name: "Jim Thompson House", type: "SIGHT", description: "Muzej." }],
        afternoon: [],
        evening: [],
      },
      locale,
      {
        priorScheduledText: "Wat Pho večer po prihodu — oglejte si ležečega Budo",
        dayInRegion: 2,
      },
    );
    expect(out.morning.some((a) => /grand palace/i.test(a.name))).toBe(true);
    expect(out.morning.some((a) => /wat pho/i.test(a.name))).toBe(true);
  });

  it("injects must-sees when Grand Palace only appears on a future skeleton day", () => {
    const out = ensureBangkokMustSee(
      {
        morning: [{ name: "Jim Thompson House", type: "SIGHT", description: "Muzej." }],
        afternoon: [
          {
            name: "Odmor v klimatiziranem kavarni",
            type: "EAT",
            description: "Med 12:00 in 15:00 je vroče.",
          },
        ],
        evening: [{ name: "Asiatique", type: "SIGHT", description: "Večer ob reki." }],
      },
      locale,
      {
        priorScheduledText: "",
        dayInRegion: 2,
      },
    );
    expect(out.morning.some((a) => /grand palace/i.test(a.name))).toBe(true);
    expect(out.morning.some((a) => /wat pho/i.test(a.name))).toBe(true);
  });

  it("return Bangkok block gets Siam Paragon, not repeat Grand Palace", () => {
    const out = ensureBangkokMustSee(
      {
        morning: [
          { name: "Grand Palace", type: "SIGHT", description: "Zjutraj." },
          { name: "Wat Pho", type: "SIGHT", description: "Dopoldan." },
        ],
        afternoon: [],
        evening: [],
      },
      locale,
      {
        priorScheduledText: "Grand Palace Wat Pho Wat Arun sončni zahod dan 3",
        dayInRegion: 2,
      },
    );
    expect(out.morning.some((a) => /grand palace|wat pho/i.test(a.name))).toBe(false);
    expect(out.morning.some((a) => /siam paragon|centralworld/i.test(a.name))).toBe(true);
  });

  it("injects Grand Palace into skeleton when AI omitted it", () => {
    const regions: TripRegion[] = [
      {
        city: "Bangkok",
        startDay: 2,
        endDay: 3,
        startDate: "2026-07-27",
        endDate: "2026-07-28",
        summary: "Bangkok",
        localTransportTips: "",
        travelTips: "",
        highlights: [{ day: 3, name: "Asiatique", description: "Večer.", priceLabel: "—", lat: 13.72, lng: 100.51 }],
        lat: 13.75,
        lng: 100.5,
      },
    ];
    const out = ensureTripBangkokMustSeeHighlights(regions, 2);
    expect(out[0]!.highlights.some((h) => /grand palace/i.test(h.name))).toBe(true);
    expect(out[0]!.highlights.some((h) => /wat pho/i.test(h.name))).toBe(true);
  });
});
