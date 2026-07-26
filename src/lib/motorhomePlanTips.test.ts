import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  enrichMotorhomePlanTips,
  thinMotorhomeMealActivities,
} from "@/lib/motorhomePlanTips";
import { enrichDayActivities } from "@/lib/dayEnrichers";
import { resolveTripLocale } from "@/lib/tripLocale";
import { repairTruncatedCopy } from "@/lib/textSanitize";

describe("repairTruncatedCopy", () => {
  it("closes mid-sentence ellipsis without leaving dangling 'in…'", () => {
    const raw =
      "Ustavite se v kakšnem manjšem mestu ob poti ali na urejenem počivališču za kosilo v avtodomu in…";
    const out = repairTruncatedCopy(raw);
    expect(out).not.toMatch(/…|\.\.\./);
    expect(out).toMatch(/avtodomu\.?$/i);
    expect(out).not.toMatch(/\bin\s*$/i);
  });

  it("repairs truncated lines inside multi-line slot blurbs", () => {
    const raw =
      "- Z jutranjim hitrim vlakom Shinkansen se boste odpravili proti Kyotu, ki slovi po templjih,…\n- Vožnja traja približno 2,5 ure.";
    const out = repairTruncatedCopy(raw);
    expect(out).not.toMatch(/…/);
    expect(out).toMatch(/2,5 ure/);
  });
});

describe("enrichMotorhomePlanTips", () => {
  it("repairs Texel ferry → Amsterdam and strips A14 spam + ellipsis", () => {
    const plan = {
      groundTransportMode: "motorhome",
      days: [
        {
          day: 5,
          city: "Amsterdam",
          title: "Amsterdam",
          morning: "",
          afternoon: "",
          evening: "",
          drivingDistanceKm: 0,
          transportationTips: "",
          activities: {},
        },
        {
          day: 6,
          city: "Amsterdam",
          title: "Texel",
          morning: "",
          afternoon:
            "Ustavite se v kakšnem manjšem mestu ob poti ali na urejenem počivališču za kosilo v avtodomu in…",
          evening: "",
          drivingDistanceKm: 400,
          transportationTips: "Stari tip (npr. A14/A4).",
          transportation: [
            {
              type: "van",
              from: "Vožnja do trajektnega pristanišča Den Helder",
              to: "Amsterdam",
              duration: "1h",
              estimatedPrice: 0,
            },
            {
              type: "ferry",
              from: "Trajekt do otoka Texel",
              to: "Amsterdam",
              duration: "1h",
              estimatedPrice: 0,
            },
          ],
          activities: {
            afternoon: [
              {
                name: "Postanek",
                type: "ACTIVITY",
                description:
                  "Ustavite se v kakšnem manjšem mestu ob poti ali na urejenem počivališču za kosilo v avtodomu in…",
              },
            ],
          },
        },
      ],
    } as AiTripPlan;

    enrichMotorhomePlanTips(plan, "sl");
    const d6 = plan.days[1]!;
    expect(d6.transportation?.[0]).toMatchObject({ from: "Amsterdam", to: "Den Helder" });
    expect(d6.transportation?.[1]).toMatchObject({ from: "Den Helder", to: "Texel" });
    expect(d6.transportationTips).not.toMatch(/A14\/A4/i);
    expect(d6.transportationTips).toMatch(/avtocest/i);
    expect(d6.activities?.afternoon?.[0]?.description).not.toMatch(/…/);
    expect(d6.afternoon).not.toMatch(/…/);
  });

  it("fixes Titova jama and adds Ferragosto tip", () => {
    const plan = {
      groundTransportMode: "motorhome",
      days: [
        {
          day: 1,
          date: "2026-08-15",
          city: "Venice",
          title: "Benetke",
          morning: "",
          afternoon: "",
          evening: "",
          transportationTips: "Trajekt iz Fusina.",
          activities: {
            morning: [
              {
                name: "Titova jama",
                type: "SIGHT",
                description: "Ogled Titove jame pri Sperlongi.",
              },
            ],
          },
        },
        {
          day: 2,
          date: "2026-08-29",
          city: "Trieste",
          title: "Vožnja",
          morning: "",
          afternoon: "",
          evening: "",
          drivingDistanceKm: 450,
          transportationTips: "",
          activities: {},
        },
      ],
    } as AiTripPlan;

    enrichMotorhomePlanTips(plan, "sl");
    expect(plan.days[0]!.activities!.morning![0]!.name).toMatch(/Tiberijeva|Villa di Tiberio/i);
    expect(plan.days[0]!.transportationTips).toMatch(/Ferragosto|rezerviraj/i);
    expect(plan.days[1]!.transportationTips).toMatch(/450|zastoj|avtocest/i);
    expect(plan.days[1]!.transportationTips).not.toMatch(/A14\/A4/i);
  });

  it("strips hotel wording and thins daily meal fillers", () => {
    const plan = {
      groundTransportMode: "motorhome",
      accommodationMode: "motorhome",
      days: [
        {
          day: 1,
          city: "Split",
          title: "Prihod",
          morning: "",
          afternoon: "",
          evening: "",
          activities: {
            afternoon: [
              { name: "Kosilo na poti", type: "EAT", description: "Postanek za kosilo." },
            ],
            evening: [
              {
                name: "Večernji sprehod in lokalna večerja",
                type: "EAT",
                description:
                  "Po počitku razišči okolico hotela peš — prva večerja v lokalni restavraciji.",
              },
              {
                name: "Sprehod v Stobreču",
                type: "ACTIVITY",
                description: "Obala pri kampu.",
              },
            ],
          },
        },
        {
          day: 2,
          city: "Split",
          title: "Mesto",
          morning: "",
          afternoon: "",
          evening: "",
          activities: {
            afternoon: [{ name: "Kosilo na Rivi", type: "EAT", description: "Dalmatinsko kosilo." }],
            evening: [
              { name: "Večerja v kampu", type: "EAT", description: "Restavracija v kampu." },
            ],
          },
        },
        {
          day: 3,
          city: "Split",
          title: "Brač",
          morning: "",
          afternoon: "",
          evening: "",
          activities: {
            evening: [
              { name: "Lokalna večerja", type: "EAT", description: "Večerja v restavraciji." },
            ],
          },
        },
        {
          day: 4,
          city: "Šibenik",
          title: "Šibenik",
          morning: "",
          afternoon: "",
          evening: "",
          activities: {
            evening: [
              {
                name: "Večerja v konobi",
                type: "EAT",
                description: "Posebna večerja v lokalni konobi.",
              },
            ],
          },
        },
      ],
    } as AiTripPlan;

    enrichMotorhomePlanTips(plan, "sl");

    const day1Eve = plan.days[0]!.activities!.evening!;
    expect(day1Eve.some((a) => /hotela/i.test(a.description ?? ""))).toBe(false);
    expect(day1Eve.some((a) => /Stobreč/i.test(a.name))).toBe(true);

    const mealNames = plan.days.flatMap((d) =>
      ["morning", "afternoon", "evening"].flatMap((slot) =>
        ((d.activities as Record<string, DayActivity[] | undefined>)?.[slot] ?? [])
          .filter((a) => /EAT|FOOD/i.test(a.type ?? "") || /kosilo|večerja/i.test(a.name))
          .map((a) => a.name),
      ),
    );
    // At most ~every 3rd day — not lunch+dinner every day.
    expect(mealNames.length).toBeLessThanOrEqual(2);
  });
});

type DayActivity = { name: string; type?: string; description?: string };

describe("thinMotorhomeMealActivities", () => {
  it("keeps at most one meal about every three days", () => {
    const plan = {
      days: [1, 2, 3, 4, 5, 6].map((day) => ({
        day,
        city: "Zadar",
        title: `Dan ${day}`,
        morning: "",
        afternoon: "",
        evening: "",
        activities: {
          evening: [{ name: "Lokalna večerja", type: "EAT", description: "Restavracija." }],
        },
      })),
    } as AiTripPlan;

    thinMotorhomeMealActivities(plan);
    const kept = plan.days.filter((d) => (d.activities?.evening?.length ?? 0) > 0).length;
    expect(kept).toBeLessThanOrEqual(2);
  });
});

describe("enrichDayActivities motorhome", () => {
  it("does not inject hotel dinner on empty arrival evening", () => {
    const locale = resolveTripLocale("SPU", "Split", "sl");
    const out = enrichDayActivities(
      { morning: [], afternoon: [], evening: [] },
      "Split",
      1,
      locale,
      { isTripDay1: true, motorhome: true },
    );
    const eveText = out.evening.map((a) => `${a.name} ${a.description}`).join(" ");
    expect(eveText).not.toMatch(/hotel/i);
    expect(eveText).toMatch(/kamp|camp/i);
    expect(out.evening.every((a) => a.type !== "EAT")).toBe(true);
  });
});
