import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  applyFlightContextToGeminiPlan,
  flightContextPromptBlock,
} from "@/lib/geminiFlightContext";

function basePlan(overrides?: Partial<AiTripPlan>): AiTripPlan {
  return {
    destinationName: "Phuket",
    summary: "test",
    safetyWarning: null,
    weatherWidget: undefined,
    totalBudgetEur: 0,
    centerLat: 7.88,
    centerLng: 98.39,
    originIata: "MUC",
    destinationIata: "HKT",
    days: [
      {
        day: 1,
        date: "2026-10-26",
        title: "Prihod",
        morning: "",
        afternoon: "",
        evening: "",
        travelHack: "",
        transportationTips: "",
        localWarnings: "",
        dailyBudgetEur: 80,
        lat: 7.88,
        lng: 98.39,
        focusName: "Phuket",
        city: "Phuket",
        category: "activity",
        activities: {
          morning: [
            {
              name: "Grand Palace tour",
              type: "SIGHT",
              description: "Celodnevni temple museum palace",
            },
          ],
          afternoon: [{ name: "Beach", type: "ACTIVITY", description: "Easy beach" }],
          evening: [],
        },
      },
      {
        day: 2,
        date: "2026-10-27",
        title: "Otok",
        morning: "",
        afternoon: "",
        evening: "",
        travelHack: "",
        transportationTips: "",
        localWarnings: "",
        dailyBudgetEur: 90,
        lat: 7.88,
        lng: 98.39,
        focusName: "Phuket",
        city: "Phuket",
        category: "beach",
        activities: {
          morning: [{ name: "Swim", type: "ACTIVITY", description: "Swim" }],
          afternoon: [],
          evening: [],
        },
      },
      {
        day: 3,
        date: "2026-11-10",
        title: "Odhod",
        morning: "",
        afternoon: "",
        evening: "",
        travelHack: "",
        transportationTips: "",
        localWarnings: "",
        dailyBudgetEur: 40,
        lat: 7.88,
        lng: 98.39,
        focusName: "Phuket",
        city: "Phuket",
        category: "transport",
        activities: {
          morning: [],
          afternoon: [
            {
              name: "Povratek domov (EU)",
              type: "TRANSPORT",
              description: "Odhod 23:00 HKT, prihod 05:00 MUC",
              arrivalTime: "23:00",
              departureTime: "05:00",
            },
          ],
          evening: [],
        },
      },
    ],
    ...overrides,
  };
}

describe("flightContextPromptBlock", () => {
  it("embeds boarding-pass times for Gemini", () => {
    const block = flightContextPromptBlock(
      {
        outboundDepart: "21:10",
        outboundArrive: "17:55",
        outboundArriveDayOffset: 1,
        inboundDepart: "15:30",
        inboundArrive: "06:00",
      },
      16,
      { originIata: "MUC", destinationIata: "HKT", language: "sl" },
    );
    expect(block).toContain("21:10");
    expect(block).toContain("17:55");
    expect(block).toContain('departure_time = "15:30"');
    expect(block).toContain("PRIORITETA NAD");
  });
});

describe("applyFlightContextToGeminiPlan", () => {
  it("rewrites arrival and return around selected flight times", () => {
    const plan = basePlan();
    applyFlightContextToGeminiPlan(
      plan,
      {
        outboundDepart: "21:10",
        outboundArrive: "17:55",
        outboundArriveDayOffset: 1,
        inboundDepart: "15:30",
        inboundArrive: "06:00",
      },
      { originIata: "MUC", language: "sl" },
    );

    expect(plan.days[0]?.inFlightDay).toBe(true);
    expect(plan.days[0]?.title).toMatch(/Odhod|let/i);
    const day1Names = (plan.days[0]?.activities?.morning ?? []).map((a) => a.name);
    expect(day1Names.join(" | ")).toMatch(/Odhod|MUC/i);
    expect(day1Names.join(" | ")).toMatch(/Mednarodni let/i);
    expect(day1Names.some((n) => /Zajtrk|Siesta|plaž/i.test(n))).toBe(false);
    expect(plan.days[0]?.activities?.afternoon ?? []).toEqual([]);
    expect(plan.days[0]?.activities?.evening ?? []).toEqual([]);

    const arrival = plan.days[1];
    expect(arrival?.inFlightDay).toBeFalsy();
    const arrivalText = JSON.stringify(arrival?.activities);
    expect(arrivalText).toMatch(/17:55/);
    expect(arrivalText).not.toMatch(/Grand Palace/i);

    expect(plan.returnFlightEu?.departureTime).toBe("15:30");
    expect(plan.returnFlightEu?.arrivalTimeEu).toBe("06:00");

    const last = plan.days[2];
    const lastText = JSON.stringify(last?.activities);
    expect(lastText).toContain("15:30");
    expect(lastText).toContain("06:00");
    expect(lastText).not.toContain("23:00");
  });

  it("clears breakfast/siesta and stamps 17:55 when landing late afternoon (+1d)", () => {
    const plan = basePlan();
    plan.days[1]!.activities = {
      morning: [
        {
          name: "Zajtrk ob morju",
          type: "FOOD",
          description: "Zajtrk v beach café — počasi pred izletom",
        },
      ],
      afternoon: [
        {
          name: "Siesta / bazen",
          type: "ACTIVITY",
          description: "Tropska pavza 13:00–16:00 — bazen ali senčnik",
        },
      ],
      evening: [
        {
          name: "Večer na plaži",
          type: "ACTIVITY",
          description: "Sprehod",
        },
      ],
    };

    applyFlightContextToGeminiPlan(
      plan,
      {
        outboundDepart: "21:10",
        outboundArrive: "17:55",
        outboundArriveDayOffset: 1,
        inboundDepart: "15:30",
        inboundArrive: "06:00",
      },
      { originIata: "MUC", language: "sl" },
    );

    const arrival = plan.days[1]!;
    const morning = JSON.stringify(arrival.activities?.morning ?? []);
    const afternoon = JSON.stringify(arrival.activities?.afternoon ?? []);
    expect(morning).not.toMatch(/Zajtrk|breakfast/i);
    expect(afternoon).not.toMatch(/Siesta|Tropska|bazen/i);
    expect(arrival.activities?.morning ?? []).toEqual([]);
    expect(arrival.activities?.afternoon ?? []).toEqual([]);
    const eveningText = JSON.stringify(arrival.activities?.evening ?? []);
    expect(eveningText).toMatch(/17:55/);
    expect(eveningText).not.toMatch(/12:00/);
    expect(eveningText).toMatch(/transfer|check|Prihod|hotel|letališ/i);
  });

  it("keeps origin departure time on same-day arrival (does not overwrite with land time)", () => {
    const plan = basePlan({
      destinationName: "Lima",
      destinationIata: "LIM",
      days: [
        {
          day: 1,
          date: "2026-08-14",
          title: "Prihod v Limo",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 80,
          lat: -12.05,
          lng: -77.04,
          focusName: "Lima",
          city: "Lima",
          category: "activity",
          activities: {
            morning: [],
            afternoon: [],
            evening: [{ name: "Sprehod Miraflores", type: "ACTIVITY", description: "Večer" }],
          },
        },
        {
          day: 2,
          date: "2026-08-15",
          title: "Mesto",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 90,
          lat: -12.05,
          lng: -77.04,
          focusName: "Lima",
          city: "Lima",
          category: "city",
          activities: {
            morning: [{ name: "Muzej", type: "SIGHT", description: "Ogled" }],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 3,
          date: "2026-08-16",
          title: "Odhod",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 40,
          lat: -12.05,
          lng: -77.04,
          focusName: "Lima",
          city: "Lima",
          category: "transport",
          activities: { morning: [], afternoon: [], evening: [] },
        },
      ],
    });

    applyFlightContextToGeminiPlan(
      plan,
      {
        outboundDepart: "12:40",
        outboundArrive: "18:15",
        outboundArriveDayOffset: 0,
        inboundDepart: "20:50",
        inboundArrive: "14:40",
      },
      { originIata: "MAD", language: "sl" },
    );

    const day1 = JSON.stringify(plan.days[0]?.activities);
    expect(day1).toMatch(/12:40/);
    expect(day1).toMatch(/18:15/);
    // Origin depart logistics must not be rewritten to landing time only.
    const originBlob = (plan.days[0]?.activities?.morning ?? [])
      .filter((a) => /Odhod|Check-in in varnostni/i.test(a.name))
      .map((a) => a.description ?? "")
      .join(" ");
    expect(originBlob).toContain("12:40");
    expect(originBlob).not.toMatch(/ob 18:15/);
  });

  it("injects domestic hop when last night city differs from international hub", () => {
    const plan = basePlan({
      destinationName: "Thailand",
      destinationIata: "BKK",
      days: [
        {
          day: 1,
          date: "2026-09-19",
          title: "Let",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 40,
          lat: 48.35,
          lng: 11.78,
          focusName: "Munich",
          city: "Munich",
          category: "transport",
          inFlightDay: true,
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 2,
          date: "2026-09-20",
          title: "Bangkok",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 80,
          lat: 13.75,
          lng: 100.5,
          focusName: "Bangkok",
          city: "Bangkok",
          category: "city",
          activities: {
            morning: [{ name: "Tempelj", type: "SIGHT", description: "Ogled" }],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 3,
          date: "2026-09-21",
          title: "Krabi plaže",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 90,
          lat: 8.08,
          lng: 98.91,
          focusName: "Krabi",
          city: "Krabi",
          category: "beach",
          activities: {
            morning: [{ name: "Ao Nang", type: "beach", description: "Plaža" }],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 4,
          date: "2026-09-22",
          title: "Odhod iz Krabija in povratek",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 40,
          lat: 8.08,
          lng: 98.91,
          focusName: "Krabi",
          city: "Krabi",
          category: "transport",
          activities: {
            morning: [],
            afternoon: [],
            evening: [
              {
                name: "Odlet",
                type: "TRANSPORT",
                description: "Odhod 23:40",
              },
            ],
          },
        },
      ],
    });

    applyFlightContextToGeminiPlan(
      plan,
      {
        outboundDepart: "22:30",
        outboundArrive: "18:10",
        outboundArriveDayOffset: 1,
        inboundDepart: "23:40",
        inboundArrive: "06:15",
      },
      { originIata: "MUC", language: "sl" },
    );

    const last = plan.days[3]!;
    expect(last.city).toMatch(/Bangkok/i);
    expect(last.title).toMatch(/Bangkok|Prevoz/i);
    const names = [
      ...(last.activities?.morning ?? []),
      ...(last.activities?.afternoon ?? []),
      ...(last.activities?.evening ?? []),
    ].map((a) => a.name);
    expect(names.join(" | ")).toMatch(/Krabi.*Bangkok|Notranji prevoz/i);
  });
});
