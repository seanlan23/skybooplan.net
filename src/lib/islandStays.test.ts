import { describe, expect, it } from "vitest";
import type { DayPlan, TripSkeleton } from "@/lib/aiPlan.functions";
import { getIslandStayKind } from "@/lib/islandStayCatalogs";
import {
  collapseSmallIslandStays,
  formatStayDateRange,
  getIslandStayCatalog,
  isSmallIsland,
  islandStayTitle,
} from "@/lib/islandStays";

function islandDay(day: number, city: string, extra: Partial<DayPlan> = {}): DayPlan {
  return {
    day,
    date: `2026-10-${String(day + 2).padStart(2, "0")}`,
    title: `${city} dan ${day}`,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 40,
    lat: 6.5,
    lng: 99.3,
    focusName: city,
    city,
    category: "beach",
    ...extra,
  };
}

const kohLipeSkeleton: TripSkeleton = {
  destinationName: "Tajska",
  destinationIata: "BKK",
  departDate: "2026-10-01",
  summary: "",
  regions: [
    {
      city: "Koh Lipe",
      startDay: 15,
      endDay: 18,
      summary: "Majhen otok",
      lat: 6.486,
      lng: 99.301,
      highlights: [],
    },
  ],
};

describe("isSmallIsland", () => {
  it("detects Koh Lipe, Boracay, Phi Phi", () => {
    expect(isSmallIsland("Koh Lipe")).toBe(true);
    expect(isSmallIsland("Boracay")).toBe(true);
    expect(isSmallIsland("Koh Phi Phi")).toBe(true);
    expect(isSmallIsland("Bangkok")).toBe(false);
  });

  it("detects Caribbean and Mediterranean islands", () => {
    expect(isSmallIsland("Aruba")).toBe(true);
    expect(isSmallIsland("Curaçao")).toBe(true);
    expect(isSmallIsland("Exuma")).toBe(true);
    expect(isSmallIsland("Santorini")).toBe(true);
    expect(isSmallIsland("Isla Holbox")).toBe(true);
    expect(isSmallIsland("Maldives")).toBe(true);
  });

  it("detects Indonesian islands", () => {
    expect(isSmallIsland("Gili Trawangan")).toBe(true);
    expect(isSmallIsland("Nusa Penida")).toBe(true);
    expect(isSmallIsland("Nusa Lembongan")).toBe(true);
    expect(isSmallIsland("Labuan Bajo")).toBe(true);
    expect(isSmallIsland("Raja Ampat")).toBe(true);
    expect(isSmallIsland("Lombok")).toBe(true);
    expect(isSmallIsland("Ubud")).toBe(false);
  });

  it("detects Malaysia, Vietnam and Cambodia islands", () => {
    expect(isSmallIsland("Langkawi")).toBe(true);
    expect(isSmallIsland("Perhentian Islands")).toBe(true);
    expect(isSmallIsland("Redang")).toBe(true);
    expect(isSmallIsland("Tioman")).toBe(true);
    expect(isSmallIsland("Phu Quoc")).toBe(true);
    expect(isSmallIsland("Con Dao")).toBe(true);
    expect(isSmallIsland("Ha Long Bay")).toBe(true);
    expect(isSmallIsland("Koh Rong")).toBe(true);
    expect(isSmallIsland("Kuala Lumpur")).toBe(false);
    expect(isSmallIsland("Siem Reap")).toBe(false);
    expect(isSmallIsland("Hoi An")).toBe(false);
  });
});

describe("getIslandStayCatalog", () => {
  it("returns boat and beach ideas for Koh Lipe", () => {
    const catalog = getIslandStayCatalog("Koh Lipe", "sl");
    expect(catalog.length).toBeGreaterThanOrEqual(4);
    expect(catalog.some((a) => /snorkl/i.test(a.name + a.description))).toBe(true);
    expect(catalog.some((a) => /čoln|longtail|boat/i.test(a.name + a.description))).toBe(true);
  });

  it("returns Koh Rong catalog with bioluminescence", () => {
    const catalog = getIslandStayCatalog("Koh Rong", "sl");
    expect(catalog.some((a) => /biolumin|plankton|sok san/i.test(a.name + a.description))).toBe(
      true,
    );
  });

  it("returns El Nido catalog with bioluminescence night tour", () => {
    const catalog = getIslandStayCatalog("El Nido", "sl");
    expect(catalog.some((a) => /bioluminiscen/i.test(a.name))).toBe(true);
  });

  it("returns Komodo-specific catalog", () => {
    const catalog = getIslandStayCatalog("Labuan Bajo", "sl");
    expect(catalog.some((a) => /komodo|padar|pink beach/i.test(a.name + a.description))).toBe(true);
  });

  it("returns Aruba-specific catalog, not Koh Lipe content", () => {
    const catalog = getIslandStayCatalog("Aruba", "sl");
    expect(catalog.some((a) => /eagle|antilla|arikok/i.test(a.name + a.description))).toBe(true);
    expect(catalog.some((a) => /pattaya|rawi/i.test(a.name + a.description))).toBe(false);
  });
});

describe("collapseSmallIslandStays — moon hints", () => {
  it("annotates Koh Lipe island block during full-moon nights", () => {
    const days = [
      islandDay(11, "Koh Lipe", { date: "2026-11-24" }),
      islandDay(12, "Koh Lipe", { date: "2026-11-25" }),
    ];
    const collapsed = collapseSmallIslandStays(days, kohLipeSkeleton, "sl");
    const block = collapsed.find((d) => d.islandStay);
    const actText = block?.islandStay?.flexibleActivities
      .map((a) => `${a.name} ${a.description}`)
      .join(" ");
    const moonHits = (actText.match(/polna luna/gi) ?? []).length;
    expect(moonHits).toBeLessThanOrEqual(1);
    expect(block?.travelHack).toMatch(/polna luna/i);
    expect(block?.travelHack).toMatch(/fotografija|bioluminiscenca.*šibka/i);
  });
});

describe("collapseSmallIslandStays", () => {
  it("merges 4 Koh Lipe days into one flexible block", () => {
    const days = [15, 16, 17, 18].map((d) => islandDay(d, "Koh Lipe"));
    const out = collapseSmallIslandStays(days, kohLipeSkeleton, "sl");
    expect(out).toHaveLength(1);
    expect(out[0]!.day).toBe(15);
    expect(out[0]!.dayEnd).toBe(18);
    expect(out[0]!.islandStay?.flexibleActivities.length).toBeGreaterThanOrEqual(5);
    expect(out[0]!.dailyBudgetEur).toBe(160);
  });

  it("keeps ferry-in day separate when marked as travel", () => {
    const days = [
      islandDay(15, "Koh Lipe", {
        transport: {
          type: "Ferry",
          duration: "2h",
          cost: "30 €",
          description: "Speedboat iz Pak Bara na Koh Lipe",
        },
        activities: {
          morning: [
            {
              name: "Prevoz: Pak Bara → Koh Lipe",
              type: "TRANSPORT",
              description: "Ferry na otok",
            },
          ],
          afternoon: [],
          evening: [],
        },
      }),
      islandDay(16, "Koh Lipe"),
      islandDay(17, "Koh Lipe"),
      islandDay(18, "Koh Lipe"),
    ];
    const out = collapseSmallIslandStays(days, kohLipeSkeleton, "sl");
    expect(out).toHaveLength(2);
    expect(out[0]!.transport?.type).toMatch(/ferry/i);
    expect(out[1]!.islandStay?.dayEnd).toBe(18);
    expect(out[1]!.islandStay?.nights).toBe(3);
  });

  it("does not collapse single island day", () => {
    const out = collapseSmallIslandStays([islandDay(15, "Koh Lipe")], kohLipeSkeleton, "sl");
    expect(out).toHaveLength(1);
    expect(out[0]!.islandStay).toBeUndefined();
  });

  it("merges 3 Aruba days into one block", () => {
    const skeleton: TripSkeleton = {
      ...kohLipeSkeleton,
      regions: [
        {
          city: "Aruba",
          startDay: 10,
          endDay: 12,
          summary: "Karibi",
          lat: 12.5,
          lng: -70.0,
          highlights: [],
        },
      ],
    };
    const days = [10, 11, 12].map((d) => islandDay(d, "Aruba"));
    const out = collapseSmallIslandStays(days, skeleton, "sl");
    expect(out).toHaveLength(1);
    expect(out[0]!.islandStay?.flexibleActivities.some((a) => /antilla|eagle/i.test(a.name))).toBe(
      true,
    );
  });

  it("leaves Bangkok days untouched", () => {
    const days = [1, 2].map((d) => islandDay(d, "Bangkok"));
    const skeleton: TripSkeleton = {
      ...kohLipeSkeleton,
      regions: [{ city: "Bangkok", startDay: 1, endDay: 2, summary: "", lat: 13.7, lng: 100.5, highlights: [] }],
    };
    const out = collapseSmallIslandStays(days, skeleton, "sl");
    expect(out).toHaveLength(2);
    expect(out.every((d) => !d.islandStay)).toBe(true);
  });
});

describe("Ha Long stay kind", () => {
  it("uses bay_cruise not small island title", () => {
    expect(getIslandStayKind("Ha Long Bay")).toBe("bay_cruise");
    expect(islandStayTitle("Ha Long Bay", 2, "sl")).toMatch(/križarka/i);
    expect(islandStayTitle("Phu Quoc", 2, "sl")).not.toMatch(/križarka/i);
  });
});

describe("formatStayDateRange", () => {
  it("formats Slovenian date span", () => {
    const label = formatStayDateRange("2026-10-17", "2026-10-21", "sl");
    expect(label).toMatch(/17/);
    expect(label).toMatch(/21/);
    expect(label).toContain("–");
  });
});
