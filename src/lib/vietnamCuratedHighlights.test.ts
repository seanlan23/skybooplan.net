import { describe, expect, it } from "vitest";
import { injectVietnamCuratedHighlights } from "@/lib/vietnamCuratedHighlights";
import { buildSkeletonDayPlans, type TripSkeleton } from "@/lib/aiPlan.functions";

describe("injectVietnamCuratedHighlights", () => {
  it("fills all Hanoi days with four core sights", () => {
    const out = injectVietnamCuratedHighlights(
      [
        {
          city: "Hanoi",
          startDay: 17,
          endDay: 20,
          highlights: [],
        },
      ],
      "sl",
    );
    const names = out[0]!.highlights.map((h) => h.name).join(" ");
    expect(names).toMatch(/mauzolej|tempelj literature|thang long|train street/i);
    expect(out[0]!.highlights.filter((h) => h.day === 17).length).toBeGreaterThan(0);
    expect(out[0]!.highlights.filter((h) => h.day === 20).length).toBeGreaterThan(0);
  });
});

describe("buildSkeletonDayPlans Vietnam padding", () => {
  it("never leaves HCMC travel-out day without activities", () => {
    const skeleton: TripSkeleton = {
      destinationName: "Vietnam",
      summary: "Test",
      totalBudgetEur: 2000,
      originIata: "LIN",
      destinationIata: "SGN",
      departDate: "2026-09-03",
      regions: injectVietnamCuratedHighlights(
        [
          {
            city: "Ho Chi Minh City",
            startDay: 1,
            endDay: 3,
            startDate: "2026-09-03",
            endDate: "2026-09-05",
            summary: "HCMC",
            localTransportTips: "",
            travelTips: "",
            lat: 10.823,
            lng: 106.629,
            highlights: [],
            transportToNext: {
              type: "flight",
              duration: "1h",
              costLabel: "50 €",
              howTo: "Domestic flight to Phu Quoc",
            },
          },
        ],
        "sl",
      ),
    };
    const day3 = buildSkeletonDayPlans(skeleton, { lang: "sl", pax: 2 }).find((d) => d.day === 3);
    const slots = [
      ...(day3?.activities?.morning ?? []),
      ...(day3?.activities?.afternoon ?? []),
      ...(day3?.activities?.evening ?? []),
    ];
    expect(slots.length).toBeGreaterThan(0);
    expect(day3?.title).not.toMatch(/zadnji dan/i);
  });

  it("clears evening on departure day at 19:40", () => {
    const skeleton: TripSkeleton = {
      destinationName: "Vietnam",
      summary: "Test",
      totalBudgetEur: 2000,
      originIata: "LIN",
      destinationIata: "SGN",
      returnFromIata: "SGN",
      departDate: "2026-09-03",
      regions: injectVietnamCuratedHighlights(
        [
          {
            city: "Hanoi",
            startDay: 17,
            endDay: 21,
            startDate: "2026-09-19",
            endDate: "2026-09-23",
            summary: "Hanoi",
            localTransportTips: "",
            travelTips: "",
            lat: 21.028,
            lng: 105.854,
            highlights: [],
          },
        ],
        "sl",
      ),
    };
    const day21 = buildSkeletonDayPlans(skeleton, {
      lang: "sl",
      pax: 2,
      flights: { inboundDepart: "19:40", outboundArrive: "14:00", outboundDepart: "08:00" },
    }).find((d) => d.day === 21);
    expect(day21?.activities?.evening ?? []).toHaveLength(0);
  });
});
