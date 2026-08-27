import { describe, expect, it } from "vitest";
import { applyRedEyeDepartureChronology, distributeDaytimeReturnActivities } from "@/lib/redEyeDeparture";
import type { DayPlan } from "@/lib/aiPlan.functions";

function day(partial: Partial<DayPlan> & { day: number; city: string }): DayPlan {
  return {
    date: "2026-11-01",
    title: `Dan ${partial.day}`,
    morning: "",
    afternoon: "",
    evening: "",
    travelHack: "",
    transportationTips: "",
    localWarnings: "",
    dailyBudgetEur: 40,
    lat: 0,
    lng: 0,
    focusName: partial.city,
    category: "city",
    activities: { morning: [], afternoon: [], evening: [] },
    ...partial,
  };
}

describe("applyRedEyeDepartureChronology", () => {
  it("moves checkout and airport transfer to the previous evening for a 02:30 return", () => {
    const days: DayPlan[] = [
      day({
        day: 17,
        city: "Bangkok",
        activities: {
          morning: [{ name: "Wat Arun", description: "Tempelj ob reki z dovolj časa pred nočnim letom." }],
          afternoon: [{ name: "Pak Khlong Talat", description: "Cvetlična tržnica." }],
          evening: [{ name: "Večerja v Bangrak", description: "Zadnja večerja v mestu pred odhodom." }],
        },
      }),
      day({
        day: 18,
        city: "Bangkok",
        activities: {
          morning: [],
          afternoon: [],
          evening: [
            { name: "Odhod iz hotela (odjava)", type: "STAY", description: "Odjava." },
            { name: "Prevoz na letališče", type: "TRANSPORT", description: "Grab na BKK." },
            { name: "Mednarodni povratni let", type: "TRANSPORT", description: "Let ob 02:30." },
          ],
        },
      }),
    ];

    applyRedEyeDepartureChronology(days, {
      inboundDepart: "02:30",
      inboundArrive: "14:10",
      language: "sl",
    });

    const prevEve = days[0]!.activities!.evening ?? [];
    expect(prevEve.some((a) => /odjava|check-out/i.test(a.name))).toBe(true);
    expect(prevEve.some((a) => /prevoz na letališč/i.test(a.name))).toBe(true);
    expect(prevEve.find((a) => /odjava|check-out/i.test(a.name))?.arrivalTime).toBe("22:30");

    const last = days[1]!;
    const lastBlob = JSON.stringify(last.activities);
    expect(lastBlob).toMatch(/Mednarodni povratni let/i);
    expect(last.activities!.evening ?? []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: expect.stringMatching(/prevoz na letališč/i) })]),
    );
    expect(lastBlob).toMatch(/pristanek doma/i);
    expect(JSON.stringify(last.activities!.evening ?? [])).not.toMatch(/Prevoz na letališče/i);
  });

  it("does not rewrite a 15:30 afternoon return", () => {
    const days: DayPlan[] = [
      day({ day: 1, city: "Bangkok" }),
      day({
        day: 2,
        city: "Bangkok",
        activities: {
          morning: [{ name: "Odhod iz hotela (odjava)", description: "Zjutraj." }],
          afternoon: [],
          evening: [],
        },
      }),
    ];
    applyRedEyeDepartureChronology(days, { inboundDepart: "15:30", language: "sl" });
    expect(days[1]!.activities!.morning?.[0]?.name).toMatch(/odjava/i);
    expect(days[0]!.activities!.evening ?? []).toHaveLength(0);
  });
});

describe("distributeDaytimeReturnActivities", () => {
  it("puts checkout in the morning and same-day MUC landing in the afternoon", () => {
    const slots = distributeDaytimeReturnActivities(
      [
        {
          name: "Odhod iz hotela (odjava)",
          type: "STAY",
          description: "Odjava.",
          arrivalTime: "05:50",
        },
        {
          name: "Prevoz na letališče",
          type: "TRANSPORT",
          description: "NRT.",
          arrivalTime: "06:20",
        },
        {
          name: "Mednarodni povratni let",
          type: "TRANSPORT",
          transportType: "flight",
          description: "Odhod 10:50, prihod 16:20.",
          arrivalTime: "10:50",
          departureTime: "16:20",
        },
      ],
      { inboundDepart: "10:50", inboundArrive: "16:20" },
      { language: "sl", originIata: "MUC" },
    );
    expect(slots.morning.map((a) => a.name).join(" ")).toMatch(/odjava/i);
    expect(slots.morning.map((a) => a.name).join(" ")).toMatch(/povratni let/i);
    expect(slots.morning.some((a) => /pristanek/i.test(a.name))).toBe(false);
    expect(slots.afternoon.some((a) => /pristanek/i.test(a.name))).toBe(true);
    expect(slots.afternoon.find((a) => /pristanek/i.test(a.name))?.arrivalTime).toBe("16:20");
  });

  it("puts 17:00 checkout before a 20:50 evening return", () => {
    const slots = distributeDaytimeReturnActivities(
      [
        {
          name: "Odhod iz hotela (odjava)",
          type: "STAY",
          description: "Odjava.",
          arrivalTime: "17:00",
        },
        {
          name: "Prevoz na letališče",
          type: "TRANSPORT",
          description: "HKT.",
          arrivalTime: "17:20",
        },
        {
          name: "Mednarodni povratni let",
          type: "TRANSPORT",
          transportType: "flight",
          description: "Odhod 20:50.",
          arrivalTime: "20:50",
        },
      ],
      { inboundDepart: "20:50", inboundArrive: "14:40" },
      { language: "sl", originIata: "MUC" },
    );
    const chrono = [...slots.morning, ...slots.afternoon, ...slots.evening];
    expect(chrono[0]?.name).toMatch(/odjava/i);
    expect(chrono[0]?.arrivalTime).toBe("17:00");
    expect(chrono.find((a) => /povratni let/i.test(a.name))?.arrivalTime).toBe("20:50");
    expect(slots.morning).toEqual([]);
  });
});
