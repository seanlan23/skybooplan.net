import { describe, expect, it } from "vitest";
import { distributeHighlightsToSlots } from "@/lib/aiPlan.functions";
import { enrichDayActivities } from "@/lib/dayEnrichers";
import { buildArrivalLogistics, isTightArrivalDay } from "@/lib/flightScheduling";
import { resolveTripLocale } from "@/lib/tripLocale";
import { rewriteActivityCityLeak } from "@/lib/textSanitize";

const locale = resolveTripLocale("BKK", "Tajska", "sl");

describe("enrichDayActivities Thailand", () => {
  it("afternoon BKK arrival (15:25) keeps morning empty — no breakfast before landing", () => {
    const flights = {
      outboundDepart: "11:00",
      outboundArrive: "15:25",
      outboundArriveDayOffset: 1,
    };
    const logistics = buildArrivalLogistics("Bangkok", flights, locale);
    const out = enrichDayActivities(
      {
        morning: [],
        afternoon: logistics.map((a) => ({
          name: a.name,
          type: a.type,
          description: a.description,
          priceLabel: a.priceLabel,
        })),
        evening: [],
      },
      "Bangkok",
      1,
      locale,
      {
        isTripDay1: true,
        isArrivalDay: true,
        tightArrivalDay: isTightArrivalDay(flights),
        lateArrival: false,
      },
    );
    const names = [...out.morning, ...out.afternoon, ...out.evening].map((a) => a.name);
    expect(out.morning).toHaveLength(0);
    expect(names.some((n) => /zajtrk|breakfast/i.test(n))).toBe(false);
    expect(names.some((n) => /klimatiziranem kavarni|12:00/i.test(n))).toBe(false);
    expect(names.some((n) => /prihod na letališče/i.test(n))).toBe(true);
  });

  it("tight arrival strips temples from evening — defers to next Bangkok day", () => {
    const flights = {
      outboundDepart: "11:00",
      outboundArrive: "09:50",
      outboundArriveDayOffset: 1,
    };
    const out = enrichDayActivities(
      {
        morning: [],
        afternoon: [
          {
            name: "Check-in, osvežitev",
            type: "STAY",
            description: "Po prihodu v hotel.",
          },
        ],
        evening: [
          {
            name: "Wat Pho",
            type: "SIGHT",
            description: "Ležeči Buda.",
          },
          {
            name: "Chinatown (Yaowarat)",
            type: "EAT",
            description: "Ulična hrana.",
          },
        ],
      },
      "Bangkok",
      1,
      locale,
      {
        isTripDay1: true,
        isArrivalDay: true,
        tightArrivalDay: true,
      },
    );
    const evening = out.evening.map((a) => a.name).join(" ");
    expect(evening).not.toMatch(/wat pho|grand palace/i);
    expect(evening).toMatch(/chinatown|yaowarat/i);
  });

  it("Bangkok day 3 with full evening still gets Grand Palace morning", () => {
    const out = enrichDayActivities(
      {
        morning: [{ name: "Lokalni zajtrk", type: "EAT", description: "Khao pad." }],
        afternoon: [
          {
            name: "Odmor v klimatiziranem kavarni",
            type: "EAT",
            description: "Med 12:00 in 15:00.",
          },
        ],
        evening: [
          { name: "Asiatique", type: "EAT", description: "Večer ob reki." },
          { name: "Rooftop bar", type: "EAT", description: "Razgled." },
        ],
      },
      "Bangkok",
      2,
      locale,
      {
        plannedSights: 1,
        priorScheduledText: "Chinatown Yaowarat večer po prihodu",
      },
    );
    expect(out.morning.some((a) => /grand palace/i.test(a.name))).toBe(true);
    expect(out.morning.some((a) => /wat pho/i.test(a.name))).toBe(true);
    expect(out.evening.some((a) => /wat arun/i.test(a.name))).toBe(true);
  });

  it("moves Wat Arun from morning to evening even when evening has two items", () => {
    const out = enrichDayActivities(
      {
        morning: [
          { name: "Bangkok Art and Culture Centre", type: "SIGHT", description: "BACC." },
          { name: "MBK Center", type: "SIGHT", description: "Nakupovanje." },
          { name: "Wat Arun", type: "SIGHT", description: "Tempelj zore." },
        ],
        afternoon: [{ name: "Lumphini Park", type: "ACTIVITY", description: "Park." }],
        evening: [
          { name: "Terminal 21", type: "EAT", description: "Food court." },
          { name: "Rooftop bar", type: "EAT", description: "Koktajl." },
        ],
      },
      "Bangkok",
      2,
      locale,
      { priorScheduledText: "Chinatown večer dan 2" },
    );
    expect(out.morning.some((a) => /wat arun/i.test(a.name))).toBe(false);
    expect(out.evening.some((a) => /wat arun/i.test(a.name))).toBe(true);
  });

  it("Bangkok day 2 gets must-see icons at correct slots, not Wat Pho in afternoon", () => {
    const out = enrichDayActivities(
      {
        morning: [
          {
            name: "Jim Thompson House",
            type: "SIGHT",
            description: "Muzej in tradicionalna hiša.",
          },
        ],
        afternoon: [],
        evening: [],
      },
      "Bangkok",
      2,
      locale,
      { paceLabel: "intensive", plannedSights: 1 },
    );
    expect(out.morning.some((a) => /grand palace|wat pho/i.test(a.name))).toBe(true);
    expect(out.evening.some((a) => /wat arun/i.test(a.name))).toBe(true);
    expect(out.afternoon.some((a) => /wat pho|wat arun|grand palace/i.test(a.name))).toBe(
      false,
    );
  });

  it("Krabi morning omits Phi Phi hint after excursion done", () => {
    const out = enrichDayActivities(
      { morning: [], afternoon: [], evening: [] },
      "Krabi",
      4,
      locale,
      { phiPhiExcursionDone: true },
    );
    const morning = out.morning[0]?.description ?? "";
    expect(morning).not.toMatch(/phi phi/i);
    expect(morning).toMatch(/railay|snorkl/i);
  });

  it("Koh Lipe evening never mentions Phuket Town", () => {
    const out = enrichDayActivities(
      {
        morning: [],
        afternoon: [],
        evening: [
          {
            name: "Seafood",
            type: "EAT",
            description: "Večerja z morskimi sadeži ali nočni trg v Phuket Town.",
          },
        ],
      },
      "Koh Lipe",
      3,
      locale,
    );
    const text = out.evening.map((a) => `${a.name} ${a.description}`).join(" ");
    expect(text).not.toMatch(/phuket/i);
    expect(text).toMatch(/walking street|koh lipe/i);
  });

  it("Koh Lipe rewrites Phuket leak on snorkeling highlights in all slots", () => {
    const phuketLeak =
      "Večerja z morskimi sadeži ali nočni trg v Phuket Town.";
    const out = enrichDayActivities(
      {
        morning: [{ name: "Snorkeling Tour", type: "ACTIVITY", description: phuketLeak }],
        afternoon: [{ name: "Koh Hin Ngam", type: "SIGHT", description: phuketLeak }],
        evening: [{ name: "Sunset Beach", type: "ACTIVITY", description: phuketLeak }],
      },
      "Koh Lipe",
      2,
      locale,
    );
    const text = [
      ...out.morning,
      ...out.afternoon,
      ...out.evening,
    ]
      .map((a) => `${a.name} ${a.description}`)
      .join(" ");
    expect(text).not.toMatch(/phuket/i);
    expect(text).toMatch(/walking street|koh lipe/i);
  });

  it("skips Chinatown afternoon when Yaowarat was evening on prior day", () => {
    const out = enrichDayActivities(
      {
        morning: [{ name: "Grand Palace", type: "SIGHT", description: "Zjutraj." }],
        afternoon: [
          {
            name: "Chinatown (Yaowarat)",
            type: "EAT",
            description: "Zvečer se spremeni v kulinarični raj.",
          },
        ],
        evening: [],
      },
      "Bangkok",
      2,
      locale,
      { priorScheduledText: "Chinatown Yaowarat večer dan 2", usedEveningVenues: new Set(["chinatown"]) },
    );
    expect(out.afternoon.some((a) => /chinatown|yaowarat/i.test(a.name))).toBe(false);
  });

  it("short-hop inbound (Ayutthaya) fills ruins, not only evening", () => {
    const out = enrichDayActivities(
      { morning: [], afternoon: [], evening: [] },
      "Ayutthaya",
      1,
      locale,
      { inboundTravelDay: false },
    );
    expect(out.morning.length + out.afternoon.length).toBeGreaterThan(0);
  });

  it("inbound travel day gets afternoon sights and evening culture", () => {
    const out = enrichDayActivities(
      { morning: [], afternoon: [], evening: [] },
      "Chiang Mai",
      1,
      locale,
      { inboundTravelDay: true },
    );
    expect(out.afternoon.some((a) => /doi suthep|suthep/i.test(a.name))).toBe(true);
    expect(out.evening.length).toBeGreaterThan(0);
  });

  it("does not repeat Chiang Mai Night Bazaar on consecutive evenings", () => {
    const used = new Set<string>();
    const day4 = enrichDayActivities(
      {
        morning: [],
        afternoon: [],
        evening: [
          {
            name: "Chiang Mai Night Bazaar",
            type: "EAT",
            description: "Večer na trgu — rokodelstvo, ulična hrana.",
          },
        ],
      },
      "Chiang Mai",
      1,
      locale,
      { usedEveningVenues: used },
    );
    const day5 = enrichDayActivities(
      {
        morning: [],
        afternoon: [],
        evening: [
          {
            name: "Chiang Mai Night Bazaar",
            type: "EAT",
            description: "Večer na trgu — rokodelstvo, ulična hrana.",
          },
        ],
      },
      "Chiang Mai",
      2,
      locale,
      { usedEveningVenues: used },
    );
    expect(day4.evening[0]!.name).toMatch(/night bazaar/i);
    expect(day5.evening[0]!.name).not.toMatch(/night bazaar/i);
    expect(day5.evening[0]!.name).toMatch(/chang phuak|nimman/i);
  });
});

describe("Chiang Mai Sunday Walking Street slot", () => {
  it("schedules Sunday Walking Street in evening, not morning", () => {
    const slots = distributeHighlightsToSlots(
      [
        {
          day: 5,
          name: "Sunday Walking Street (Nedeljski bazar)",
          description: "Odlična priložnost za večerni sprehod.",
          visitDuration: "3h",
          priceLabel: "—",
          lat: 18.78,
          lng: 98.98,
        },
        {
          day: 5,
          name: "Wat Chedi Luang",
          description: "Tempelj v starem mestu.",
          visitDuration: "1h",
          priceLabel: "40 THB",
          lat: 18.79,
          lng: 98.99,
        },
      ],
      "sl",
    );
    expect(slots.morning.some((a) => /sunday walking|nedeljski bazar/i.test(a.name))).toBe(
      false,
    );
    expect(slots.evening.some((a) => /sunday walking|nedeljski bazar/i.test(a.name))).toBe(
      true,
    );
  });
});

describe("rewriteActivityCityLeak Koh Lipe", () => {
  it("rewrites Phuket Town dinner phrase", () => {
    const fixed = rewriteActivityCityLeak(
      "Večerja z morskimi sadeži ali nočni trg v Phuket Town.",
      "Koh Lipe",
    );
    expect(fixed).not.toMatch(/phuket/i);
    expect(fixed).toMatch(/walking street|koh lipe/i);
  });
});

describe("enrichDayActivities Phi Phi full-day", () => {
  const hktLocale = resolveTripLocale("HKT", "Phuket", "sl");

  it("does not inject afternoon siesta after morning Phi Phi excursion", () => {
    const out = enrichDayActivities(
      {
        morning: [
          {
            name: "Koh Phi Phi / Maya Bay",
            type: "SIGHT",
            description: "Celodnevni izlet z ladjo, odhod zjutraj.",
          },
        ],
        afternoon: [],
        evening: [],
      },
      "Phuket",
      3,
      hktLocale,
      { plannedSights: 1 },
    );
    const afternoonBlob = out.afternoon.map((a) => `${a.name} ${a.description}`).join(" ");
    expect(afternoonBlob).not.toMatch(/siesta|bazen|13:00/i);
  });
});
