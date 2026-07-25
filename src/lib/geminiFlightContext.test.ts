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

    const prihod = (arrival.activities?.evening ?? []).find((a) =>
      /prihod na letališč/i.test(a.name),
    );
    expect(prihod?.arrivalTime).toBe("17:55");
    expect(prihod?.departureTime).toBeUndefined();
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

  it("does not invent LA→NY ground transfer when trip ends in Los Angeles (JFK ticket hub)", () => {
    const emptySlots = {
      morning: "",
      afternoon: "",
      evening: "",
      travelHack: "",
      transportationTips: "",
      localWarnings: "",
      dailyBudgetEur: 120,
      category: "city" as const,
    };
    const plan = basePlan({
      destinationName: "United States",
      destinationIata: "JFK",
      centerLat: 40.71,
      centerLng: -74.0,
      days: [
        {
          day: 1,
          date: "2026-08-01",
          title: "Arrival NYC",
          ...emptySlots,
          lat: 40.71,
          lng: -74.0,
          city: "New York",
          focusName: "New York",
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 2,
          date: "2026-08-10",
          title: "Las Vegas",
          ...emptySlots,
          lat: 36.17,
          lng: -115.14,
          city: "Las Vegas",
          focusName: "Las Vegas",
          activities: {
            morning: [{ name: "Strip", type: "SIGHT", description: "Walk" }],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 3,
          date: "2026-08-15",
          title: "Los Angeles",
          ...emptySlots,
          lat: 34.05,
          lng: -118.24,
          city: "Los Angeles",
          focusName: "Los Angeles",
          activities: {
            morning: [{ name: "Santa Monica", type: "SIGHT", description: "Beach" }],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 4,
          date: "2026-08-18",
          title: "Transfer to New York and international departure",
          ...emptySlots,
          lat: 34.05,
          lng: -118.24,
          city: "Los Angeles",
          focusName: "Los Angeles",
          category: "transport",
          transportation: [
            {
              type: "flight",
              from: "Hotel Check out & Transfer to LAX",
              to: "New York",
              duration: "1h",
            },
          ],
          activities: {
            morning: [
              {
                name: "Domestic transfer Los Angeles → New York",
                type: "TRANSPORT",
                description: "Budget ground transfer — book ahead.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        },
      ],
    });

    applyFlightContextToGeminiPlan(
      plan,
      {
        outboundDepart: "06:55",
        outboundArrive: "14:20",
        outboundArriveDayOffset: 0,
        inboundDepart: "16:05",
        inboundArrive: "08:40",
      },
      { originIata: "MUC", language: "en" },
    );

    const last = plan.days[3]!;
    expect(last.city).toMatch(/Los Angeles/i);
    expect(last.title).toMatch(/Departure from Los Angeles/i);
    expect(last.title).not.toMatch(/Transfer to New York/i);
    expect(last.transportation).toBeFalsy();
    const blob = JSON.stringify(last.activities);
    expect(blob).not.toMatch(/Budget ground transfer/i);
    expect(blob).not.toMatch(/Los Angeles → New York|Los Angeles -> New York/i);
    expect(blob).toMatch(/16:05/);
    const acts = [
      ...(last.activities?.morning ?? []),
      ...(last.activities?.afternoon ?? []),
      ...(last.activities?.evening ?? []),
    ];
    const checkout = acts.find((a) => /check-out/i.test(a.name));
    expect(checkout?.arrivalTime).toBe("12:05");
    expect(checkout?.description ?? "").toMatch(/16:05/);
    expect(checkout?.description ?? "").not.toMatch(/flight at 12:05/i);
  });

  it("does not invent Lyon→Paris flight when day 7 already returned by TGV", () => {
    const emptySlots = {
      morning: "",
      afternoon: "",
      evening: "",
      travelHack: "",
      transportationTips: "",
      localWarnings: "",
      dailyBudgetEur: 80,
      category: "city" as const,
    };
    const plan = basePlan({
      destinationName: "Paris",
      destinationIata: "CDG",
      centerLat: 48.86,
      centerLng: 2.35,
      accommodationMode: "hotel",
      days: [
        {
          day: 1,
          date: "2026-07-01",
          title: "Arrival",
          ...emptySlots,
          lat: 48.86,
          lng: 2.35,
          city: "Paris",
          focusName: "Paris",
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 2,
          date: "2026-07-02",
          title: "Paris",
          ...emptySlots,
          lat: 48.86,
          lng: 2.35,
          city: "Paris",
          focusName: "Paris",
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 3,
          date: "2026-07-03",
          title: "TGV to Lyon",
          ...emptySlots,
          lat: 45.75,
          lng: 4.85,
          city: "Lyon",
          focusName: "Lyon",
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 4,
          date: "2026-07-04",
          title: "Lyon",
          ...emptySlots,
          lat: 45.75,
          lng: 4.85,
          city: "Lyon",
          focusName: "Lyon",
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 5,
          date: "2026-07-05",
          title: "Lyon",
          ...emptySlots,
          lat: 45.75,
          lng: 4.85,
          city: "Lyon",
          focusName: "Lyon",
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 6,
          date: "2026-07-06",
          title: "Lyon",
          ...emptySlots,
          lat: 45.75,
          lng: 4.85,
          city: "Lyon",
          focusName: "Lyon",
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 7,
          date: "2026-07-07",
          title: "TGV Lyon → Paris",
          ...emptySlots,
          lat: 48.86,
          lng: 2.35,
          city: "Lyon",
          focusName: "Lyon",
          activities: {
            morning: [
              {
                name: "TGV Lyon → Paris",
                type: "TRANSPORT",
                description: "High-speed train back to Paris for the flight home.",
              },
            ],
            afternoon: [
              {
                name: "Hotel check-in Paris",
                type: "STAY",
                description: "Check in near the hotel in Paris.",
              },
            ],
            evening: [],
          },
        },
        {
          day: 8,
          date: "2026-07-08",
          title: "Flight Lyon to Paris",
          ...emptySlots,
          lat: 45.75,
          lng: 4.85,
          city: "Lyon",
          focusName: "Lyon",
          activities: {
            morning: [
              {
                name: "Flight Lyon → Paris",
                type: "TRANSPORT",
                transportType: "flight",
                description: "Phantom domestic flight",
              },
            ],
            afternoon: [],
            evening: [],
          },
        },
      ],
    });

    applyFlightContextToGeminiPlan(
      plan,
      {
        outboundDepart: "08:00",
        outboundArrive: "09:30",
        outboundArriveDayOffset: 0,
        inboundDepart: "08:30",
        inboundArrive: "10:00",
      },
      { originIata: "MUC", destinationIata: "CDG", language: "en" },
    );

    const last = plan.days.find((d) => d.day === 8)!;
    expect(last.city).toMatch(/Paris/i);
    expect(last.title).toMatch(/Departure from Paris/i);
    expect(last.title).not.toMatch(/Transfer to Paris/i);
    const names = [
      ...(last.activities?.morning ?? []),
      ...(last.activities?.afternoon ?? []),
      ...(last.activities?.evening ?? []),
    ].map((a) => a.name);
    expect(names.join(" | ")).not.toMatch(/Flight Lyon|Lyon → Paris/i);
    const transfer = [
      ...(last.activities?.morning ?? []),
      ...(last.activities?.afternoon ?? []),
      ...(last.activities?.evening ?? []),
    ].find((a) => /airport transfer/i.test(a.name));
    expect(transfer?.description).toMatch(/08:30/);
    expect(transfer?.description).not.toMatch(/departs at 05:00/i);
    expect(transfer?.arrivalTime).toBe("05:00");
  });

  it("strips LLM clocks from leftover sights on departure day", () => {
    const plan = basePlan({
      destinationName: "Paris",
      destinationIata: "CDG",
      days: [
        {
          day: 1,
          date: "2026-07-01",
          title: "Arrival",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 80,
          lat: 48.86,
          lng: 2.35,
          city: "Paris",
          focusName: "Paris",
          category: "city",
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 2,
          date: "2026-07-02",
          title: "Paris",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 80,
          lat: 48.86,
          lng: 2.35,
          city: "Paris",
          focusName: "Paris",
          category: "city",
          activities: {
            morning: [
              {
                name: "Louvre",
                type: "SIGHT",
                arrivalTime: "09:15",
                departureTime: "12:00",
                description: "Meet the guide at 09:15 sharp.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 3,
          date: "2026-07-03",
          title: "Odhod",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 40,
          lat: 48.86,
          lng: 2.35,
          city: "Paris",
          focusName: "Paris",
          category: "transport",
          activities: {
            morning: [
              {
                name: "Louvre last look",
                type: "SIGHT",
                arrivalTime: "07:00",
                departureTime: "08:00",
                description: "Be there at 07:00 before the crowds.",
              },
              {
                name: "Fake checkout invent",
                type: "STAY",
                arrivalTime: "12:00",
                departureTime: "13:00",
                description: "Checkout fantasy at 12:00",
              },
            ],
            afternoon: [],
            evening: [],
          },
        },
      ],
    });

    applyFlightContextToGeminiPlan(
      plan,
      {
        outboundDepart: "08:00",
        outboundArrive: "09:30",
        outboundArriveDayOffset: 0,
        inboundDepart: "18:10",
        inboundArrive: "20:00",
      },
      { originIata: "MUC", language: "en" },
    );

    const last = plan.days.find((d) => d.day === 3)!;
    const acts = [
      ...(last.activities?.morning ?? []),
      ...(last.activities?.afternoon ?? []),
      ...(last.activities?.evening ?? []),
    ];
    const flight = acts.find((a) => /international return flight/i.test(a.name));
    expect(flight?.arrivalTime).toBe("18:10");

    const sights = acts.filter((a) => /Louvre/i.test(a.name));
    for (const s of sights) {
      expect(s.arrivalTime).toBeFalsy();
      expect(s.departureTime).toBeFalsy();
      expect(s.description ?? "").not.toMatch(/\b\d{1,2}:\d{2}\b/);
    }

    const checkout = acts.find((a) => /check-out/i.test(a.name));
    expect(checkout?.arrivalTime).toBeTruthy();
    expect(checkout!.arrivalTime).not.toBe("12:00");
  });

  it("staggers last-day checkout/transfer/airport before return flight (no 18:10 pile-up)", () => {
    const plan = basePlan({
      destinationName: "Manila",
      destinationIata: "MNL",
      centerLat: 14.6,
      centerLng: 121.0,
      days: [
        {
          day: 1,
          date: "2026-10-23",
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
          city: "Munich",
          focusName: "Munich",
          category: "transport",
          activities: { morning: [], afternoon: [], evening: [] },
        },
        {
          day: 2,
          date: "2026-10-24",
          title: "Manila",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 80,
          lat: 14.6,
          lng: 121.0,
          city: "Manila",
          focusName: "Manila",
          category: "city",
          activities: {
            morning: [{ name: "City", type: "SIGHT", description: "Walk" }],
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
          lat: 14.6,
          lng: 121.0,
          city: "Manila",
          focusName: "Manila",
          category: "transport",
          activities: {
            morning: [
              {
                name: "Hotel check-out",
                type: "STAY",
                arrivalTime: "18:10",
                departureTime: "06:00",
                description: "Checkout 18:10 - 06:00 (+1)",
              },
              {
                name: "Airport transfer",
                type: "TRANSPORT",
                arrivalTime: "18:10",
                departureTime: "06:00",
                description: "Transfer 18:10 - 06:00 (+1)",
              },
              {
                name: "Airport arrival and departure",
                type: "TRANSPORT",
                arrivalTime: "18:10",
                departureTime: "06:00",
                description: "Airport 18:10 - 06:00 (+1)",
              },
            ],
            afternoon: [],
            evening: [],
          },
        },
      ],
    });

    applyFlightContextToGeminiPlan(
      plan,
      {
        outboundDepart: "11:25",
        outboundArrive: "22:00",
        outboundArriveDayOffset: 0,
        inboundDepart: "18:10",
        inboundArrive: "06:00",
      },
      { originIata: "MUC", language: "en" },
    );

    const last = plan.days[2]!;
    const acts = [
      ...(last.activities?.morning ?? []),
      ...(last.activities?.afternoon ?? []),
      ...(last.activities?.evening ?? []),
    ];
    const checkout = acts.find((a) => /check-out/i.test(a.name));
    const transfer = acts.find((a) => /airport transfer|prevoz na letališč/i.test(a.name));
    const airport = acts.find((a) => /airport check-in|prihod na letališče in check-in/i.test(a.name));
    const flight = acts.find(
      (a) => a.transportType === "flight" || /international return flight|mednarodni/i.test(a.name),
    );

    expect(checkout?.arrivalTime).toBeTruthy();
    expect(transfer?.arrivalTime).toBeTruthy();
    expect(airport?.arrivalTime).toBeTruthy();
    expect(flight?.arrivalTime).toBe("18:10");
    expect(flight?.departureTime).toBe("06:00");

    // Pre-flight logistics must not share the overnight flight end clock.
    expect(checkout?.departureTime).toBeFalsy();
    expect(transfer?.departureTime).toBeFalsy();
    expect(airport?.departureTime).toBeFalsy();
    expect(checkout?.arrivalTime).not.toBe("18:10");
    expect(transfer?.arrivalTime).not.toBe("18:10");
    expect(airport?.arrivalTime).not.toBe("18:10");

    const toMin = (hm?: string) => {
      const m = hm?.match(/(\d{1,2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
    };
    expect(toMin(checkout!.arrivalTime)).toBeLessThan(toMin(transfer!.arrivalTime));
    expect(toMin(transfer!.arrivalTime)).toBeLessThan(toMin(airport!.arrivalTime));
    expect(toMin(airport!.arrivalTime)).toBeLessThan(toMin(flight!.arrivalTime));
  });

  it("EN day-1 origin check-in keeps MUC clock (not NYC land time)", () => {
    const plan = basePlan({
      destinationName: "New York",
      destinationIata: "JFK",
      centerLat: 40.64,
      centerLng: -73.78,
      days: [
        {
          day: 1,
          date: "2026-07-01",
          title: "Arrival",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 120,
          lat: 40.64,
          lng: -73.78,
          city: "New York",
          focusName: "New York",
          category: "city",
          activities: {
            morning: [
              {
                name: "Check-in and security",
                type: "TRANSPORT",
                arrivalTime: "11:50",
                description: "Arrive at Munich (MUC) by 11:50 for security.",
              },
              {
                name: "Departure: Munich (MUC)",
                type: "TRANSPORT",
                arrivalTime: "14:20",
                description: "Take off at 14:20.",
              },
            ],
            afternoon: [
              {
                name: "Airport arrival",
                type: "TRANSPORT",
                arrivalTime: "12:00",
                description: "Land at JFK around 12:00.",
              },
            ],
            evening: [],
          },
        },
        {
          day: 2,
          date: "2026-07-02",
          title: "City",
          morning: "",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 150,
          lat: 40.76,
          lng: -73.98,
          city: "New York",
          focusName: "New York",
          category: "city",
          activities: {
            morning: [{ name: "Central Park", type: "SIGHT", description: "Walk" }],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 3,
          date: "2026-07-08",
          title: "Home",
          morning: "Huge checkout and breakfast wall of text without bullets",
          afternoon: "",
          evening: "",
          travelHack: "",
          transportationTips: "",
          localWarnings: "",
          dailyBudgetEur: 80,
          lat: 40.76,
          lng: -73.98,
          city: "New York",
          focusName: "New York",
          category: "transport",
          transportation: [
            {
              type: "transfer",
              from: "JFK Airport",
              to: "New York",
              duration: "45 min",
            },
          ],
          activities: {
            morning: [
              {
                name: "Hotel check-out and breakfast dump",
                type: "STAY",
                description:
                  "Complete check-out in the morning. Store bags at reception if you have a short final stop, or take them with you. late evening flight at 21:50 — nearly full day after check-out; head to airport ~3h before departure. Then grab breakfast somewhere nearby and wander until transfer.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        },
      ],
    });

    applyFlightContextToGeminiPlan(
      plan,
      {
        outboundDepart: "14:20",
        outboundArrive: "17:05",
        outboundArriveDayOffset: 0,
        inboundDepart: "21:50",
        inboundArrive: "11:10",
      },
      { originIata: "MUC", language: "en" },
    );

    const day1 = plan.days[0]!;
    const morning = day1.activities?.morning ?? [];
    const afternoon = day1.activities?.afternoon ?? [];
    const evening = day1.activities?.evening ?? [];
    // Origin security/departure rows must keep MUC boarding-pass clocks — never land time.
    for (const a of morning.filter((x) => /check-in and security|departure:\s*munich/i.test(x.name))) {
      expect(a.arrivalTime).not.toBe("17:05");
      expect(`${a.description ?? ""} ${a.arrivalTime ?? ""}`).not.toMatch(/\b17:05\b/);
      expect(a.description ?? "").toMatch(/14:20/);
    }
    const landBlob = JSON.stringify([...afternoon, ...evening]);
    expect(landBlob).toMatch(/17:05/);

    const last = plan.days[2]!;
    expect(last.transportation).toBeFalsy();
    expect(last.morning).toBe("");
    expect(last.title).toMatch(/Departure from New York/i);
    expect(last.title).not.toMatch(/JFK Airport\s*→/i);

    const lastActs = [
      ...(last.activities?.morning ?? []),
      ...(last.activities?.afternoon ?? []),
      ...(last.activities?.evening ?? []),
    ];
    const checkout = lastActs.find((a) => /check-out/i.test(a.name));
    const airport = lastActs.find((a) => /airport check-in/i.test(a.name));
    const transfer = lastActs.find((a) => /airport transfer/i.test(a.name));
    expect(checkout?.arrivalTime).toBe("17:50");
    expect(airport?.arrivalTime).toBe("18:50");
    expect(transfer?.description ?? "").toMatch(/21:50/);
    expect(checkout?.description ?? "").toMatch(/21:50/);
    expect(checkout?.description ?? "").not.toMatch(/flight at 17:50/i);
    expect(airport?.description ?? "").toMatch(/21:50/);
    expect(airport?.description ?? "").not.toMatch(/Late departure at 18:50/i);
    // Gemini checkout wall-of-text must not remain as a morning sight.
    expect(JSON.stringify(last.activities?.morning ?? [])).not.toMatch(/breakfast dump/i);
  });
});
