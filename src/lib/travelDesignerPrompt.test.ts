import { describe, expect, it } from "vitest";
import { buildTravelBriefUserBlock } from "@/lib/travelDesignerPrompt";
import { tripPlanUserPrompt } from "@/lib/geminiPro";
import type { GenerateTripPlanParams } from "@/lib/geminiPro.shared";

const briefFields = {
  origin: "Munich (MUC)",
  destinations: "Phuket (HKT)",
  startDate: "2026-10-26",
  endDate: "2026-11-10",
  travellers: "3 odraslih",
  mainTransport: "flight" as const,
  additionalTransport: "Selected ticket: outbound MUC 21:10 → HKT 18:55.",
  pace: "relaxed" as const,
  interests: "beaches, food",
  budget: "mid-range" as const,
  accommodation: "hotels (city + nights only — Booking.com)",
  mandatoryPlaces: "1 night(s) in Phuket; 3 night(s) in Khao Sok",
  additionalWishes: "Avoid night driving.",
};

function baseParams(
  overrides?: Partial<GenerateTripPlanParams>,
): GenerateTripPlanParams {
  return {
    originIata: "MUC",
    destinationIata: "HKT",
    destination: "Phuket",
    month: "oktober",
    days: 16,
    departDate: "2026-10-26",
    returnDate: "2026-11-10",
    pax: { adults: 3, childrenAges: [] },
    budget: "standard",
    wishTags: [],
    pace: "calm",
    customWishes:
      "prvo noč phuket, 3 noči khao sok, 2 noči ao nang, 5 noči koh phi phi 2 noči patong",
    flightContext: {
      outboundDepart: "21:10",
      outboundArrive: "18:55",
      outboundArriveDayOffset: 1,
      inboundDepart: "15:30",
      inboundArrive: "06:00",
    },
    language: "sl",
    currency: "EUR",
    ...overrides,
  };
}

describe("buildTravelBriefUserBlock", () => {
  it("fills the briefing instead of leaving [ORIGIN] placeholders", () => {
    const text = buildTravelBriefUserBlock(briefFields);
    expect(text).toMatch(/=== USER PARAMETERS/);
    expect(text).toMatch(/languageCode: sl/);
    expect(text).toMatch(/languageName: Slovenian/);
    expect(text).toMatch(/mainTransport: flight/);
    expect(text).toMatch(/interests: beaches, food/);
    expect(text).toMatch(/Origin: Munich \(MUC\)/);
    expect(text).toMatch(/Destination\(s\): Phuket \(HKT\)/);
    expect(text).toMatch(/Pace: relaxed/);
    expect(text).toMatch(/1 night\(s\) in Phuket/);
    expect(text).not.toMatch(/\[ORIGIN\]|\[DESTINATION|\[START_DATE\]/);
    expect(text).toMatch(/Strictly include all mandatory places/);
    expect(text).toMatch(/no truncated text/);
    expect(text).toMatch(/DAY COUNT & DEPARTURE RULE/);
    expect(text).toMatch(/EXACTLY match the number of days between START_DATE \(2026-10-26\) and END_DATE \(2026-11-10\) inclusive: 16/);
    expect(text).toMatch(/Day 16 \(the final day\) MUST ALWAYS be the departure day/);
    expect(text).toMatch(/hotel check-out, airport transfer, international return flight home/);
    expect(text).toMatch(/RED-EYE RETURN/);
    expect(text).toMatch(/days\[\]\.transfer/);
    expect(text).toMatch(/Inclusive calendar days: 16/);
    expect(text).not.toMatch(/\[START_DATE\]|\[END_DATE\]/);
    expect(text).toMatch(/NO PLACEHOLDERS \/ NO TRUNCATION/);
    expect(text).toMatch(/NIKOLI in pod nobenim pogojem ne izpisuj/);
    expect(text).toMatch(/fully completed description \(minimum 25 words\)/);
    expect(text).toMatch(/NEVER output placeholders, unfinished titles/);
    expect(text).toMatch(/sentences ending with '\.\.\.'/);
    expect(text).toMatch(/TRAVEL DAY RULE/);
    expect(text).toMatch(/Morning is reserved for travel\/transfer/);
    expect(text).toMatch(/afternoon\/evening after hotel check-in/);
    expect(text).toMatch(/STRICT GENERATION & FORMATTING CONSTRAINTS/);
    expect(text).toMatch(/Target Language: Slovenian \(sl\)/);
    expect(text).toMatch(/The entire output must be 100% in this language/);
    expect(text).toMatch(/Exactly 16 Days/);
    expect(text).toMatch(/Day 1 is flight arrival\/start/);
    expect(text).toMatch(/Day 16 is strictly hotel check-out, transfer to airport and return international flight/);
    expect(text).toMatch(/fully fleshed-out morning, afternoon, and evening/);
    expect(text).toMatch(/strictly valid, parseable JSON/);
    expect(text).toMatch(/no markdown code fences/);
    expect(text).not.toMatch(/\[LANGUAGE\]|\[N\]/);
  });
});

describe("tripPlanUserPrompt", () => {
  it("puts the filled travel brief first with stay-plan cities as mandatory places", () => {
    const user = tripPlanUserPrompt(baseParams());
    expect(user.startsWith("=== USER PARAMETERS")).toBe(true);
    expect(user).toMatch(/languageCode: sl/);
    expect(user).toMatch(/Create a complete day-by-day travel itinerary/);
    expect(user).toMatch(/Origin: Munich/);
    expect(user).toMatch(/Main transport mode: flight/);
    expect(user).toMatch(/Pace: relaxed/);
    expect(user).toMatch(/Budget level: mid-range/);
    expect(user).toMatch(/night\(s\) in Phuket/i);
    expect(user).toMatch(/night\(s\) in Khao Sok/i);
    expect(user).not.toMatch(/\[ORIGIN\]/);
    expect(user).toMatch(/Ustvari 16-dnevni načrt/);
    expect(user).toMatch(/userWishes: prvo noč phuket/);
    expect(user).toMatch(/JSON ključi morning\/afternoon\/evening so VEDNO obvezni/);
    expect(user).not.toMatch(/prazni sloti pred\/za letom in ob mirnem tempu SO dovoljeni/);
  });

  it("binds language, interests, transport, wishes, and currency from planner params", () => {
    const user = tripPlanUserPrompt(
      baseParams({
        language: "de",
        currency: "USD",
        priorities: ["Traumstrände, Kulinarik"],
        wishTags: ["Najem avtomobila"],
        customWishes: "zwei Nächte in Ao Nang, dann Koh Lanta",
      }),
    );
    expect(user).toMatch(/languageCode: de/);
    expect(user).toMatch(/languageName: German/);
    expect(user).toMatch(/currency: USD/);
    expect(user).toMatch(/interests: Traumstrände, Kulinarik/);
    expect(user).toMatch(/userWishes: zwei Nächte in Ao Nang/);
    expect(user).toMatch(/mainTransport: flight/);
    expect(user).toMatch(/Rental car requested/);
    expect(user).toMatch(/Target Language: German \(de\)/);
    expect(user).toMatch(/Jezik izhoda: de/);
    expect(user).toMatch(/Valuta: USD/);
    expect(user).toMatch(/Kaj jih zanima: Traumstrände, Kulinarik/);
    expect(user).toMatch(/Prevoz: flight/);
  });

  it("labels motorhome trips as campsite road travel", () => {
    const user = tripPlanUserPrompt(
      baseParams({
        originIata: "VIE",
        destinationIata: "ZAG",
        originPlace: "Vienna",
        destinationPlace: "Croatia",
        destination: "Croatia",
        groundTransportMode: "motorhome",
        customWishes: undefined,
        flightContext: undefined,
        wishTags: ["sea"],
      }),
    );
    expect(user).toMatch(/Main transport mode: motorhome/);
    expect(user).toMatch(/mainTransport: motorhome/);
    expect(user).toMatch(/campsites \/ RV parks/);
    expect(user).toMatch(/drive\/train home to origin/);
    expect(user).toMatch(/Day 1 is the journey start/);
    expect(user).toMatch(/strictly the return home \(drive\/train to origin/);
    expect(user).not.toMatch(/international return flight home — the app stamps/);
    expect(user).not.toMatch(/Day 16 is strictly hotel check-out, transfer to airport and return international flight/);
  });
});
