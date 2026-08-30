import { describe, expect, it } from "vitest";
import { tripPlanControlRules, tripPlanSystemPrompt, dayRangePromptBlock, GEMINI_TRIP_PLAN_MAX_OUTPUT_TOKENS, GEMINI_TRIP_PLAN_TEMPERATURE, GEMINI_TRIP_PLAN_THINKING_BUDGET, GEMINI_TRIP_PLAN_MODEL, resolveTripPlanModel, extractGeneratedObject } from "@/lib/geminiPro";
import type { GenerateTripPlanParams } from "@/lib/geminiPro.shared";

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

describe("trip plan output tokens", () => {
  it("sets max_output_tokens to the one-shot structured-output cap", () => {
    expect(GEMINI_TRIP_PLAN_MAX_OUTPUT_TOKENS).toBe(32768);
    expect(GEMINI_TRIP_PLAN_TEMPERATURE).toBe(0.3);
  });

  it("disables Gemini 2.5 thinking so the first JSON tokens are not delayed past the stall window", () => {
    expect(GEMINI_TRIP_PLAN_THINKING_BUDGET).toBe(0);
  });

  it("refuses gemini-2.5-flash for live plans because it thinks for minutes before JSON", () => {
    expect(resolveTripPlanModel("gemini-2.5-flash")).toBe("gemini-2.5-flash-lite");
    expect(resolveTripPlanModel("gemini-2.5-pro")).toBe("gemini-2.5-flash-lite");
    expect(resolveTripPlanModel(undefined)).toBe("gemini-2.5-flash-lite");
    expect(GEMINI_TRIP_PLAN_MODEL).not.toMatch(/^gemini-2\.5-flash$/);
  });

  it("recovers a truncated Gemini object from the AI SDK error payload", () => {
    expect(extractGeneratedObject({ cause: { value: { itinerar: [{ city: "Bangkok" }] } } })).toEqual({
      itinerar: [{ city: "Bangkok" }],
    });
  });
});

describe("tripPlanControlRules", () => {
  it("puts wishes and flight above full-day packing", () => {
    const block = tripPlanControlRules({
      pace: "calm",
      hasFlightContext: true,
      explicitStayPlan: true,
      arrivalCity: "Phuket",
      destinationIata: "HKT",
      arrivalDay: 2,
    });
    expect(block).toMatch(/HIERARHIJA PRAVIL/);
    expect(block).toMatch(/ABSOLUTNO PREDNOST/);
    expect(block).toMatch(/Dan prihoda = dan 2/);
    expect(block).toMatch(/Zajtrk ob morju/);
    expect(block).toMatch(/TEMPO MIREN/);
    expect(block).toMatch(/fleksibilno/);
    expect(block).toMatch(/STROGI JSON/);
    expect(block).toMatch(/mesto DNEVNEGA programa|mesto NOČITVE/);
    expect(block).toMatch(/enodnevni skok/);
    expect(block).toMatch(/NATANČNO število nočitev/);
    expect(block).toMatch(/enodnevni izlet/);
  });

  it("system prompt requires morning, afternoon, evening and transport notes", () => {
    const system = tripPlanSystemPrompt(baseParams());
    expect(system).toMatch(/HIERARHIJA PRAVIL/);
    expect(system).toMatch(/SMSEL POTI|ROUTE SENSE/);
    expect(system).not.toMatch(/DVO-STOPENJSKI NAČRT|FAZA 1/i);
    expect(system).toMatch(/CORE SYSTEM RULES/);
    expect(system).toMatch(/ALWAYS the city where the traveller SLEEPS that night/);
    expect(system).toMatch(/CITY HEADER CONSISTENCY/);
    expect(system).toMatch(/until the day the transfer actually occurs/);
    expect(system).toMatch(/strictly increasing clock order/);
    expect(system).toMatch(/EXACTLY once per day/);
    expect(system).toMatch(/ISLAND HOPS/);
    expect(system).toMatch(/Busuanga \(USU\)/);
    expect(system).toMatch(/Cebu → Malapascua/);
    expect(system).toMatch(/UNIQUE LOCAL TIPS/);
    expect(system).toMatch(/Valencia→Vienna/);
    expect(system).toMatch(/2 potnika/);
    expect(system).toMatch(/exactly 3/);
    expect(system).toMatch(/30–45/);
    expect(system).toMatch(/under 14/);
    expect(system).toMatch(/Markdown table pipes/);
    expect(system).toMatch(/30°C/);
    expect(system).toMatch(/\\circ/);
    expect(system).toMatch(/experienced human travel consultant/);
    expect(system).toMatch(/Never mix English terms or placeholder words/);
    expect(system).toMatch(/10–11 hours door-to-door/);
    expect(system).toMatch(/Never invent hotel/);
    expect(system).toMatch(/KAKOVOST NAČRTA/);
    expect(system).toMatch(/vse destinacije/);
    expect(system).toMatch(/prazni timeSlot-i PRED\/ZA letom so OBVEZNI/);
    expect(system).not.toMatch(/Noben del dneva ne sme ostati prazen/);
    expect(system).not.toMatch(/OBVEZNA ČASOVNA STRUKTURA DNEVA \(brez izjeme\)/);
    expect(system).toMatch(/Dan prihoda na destinacijo = dan 2/);
    expect(system).toMatch(/STROGI JSON/);
    expect(system).not.toMatch(/category airport z natančno uro/i);
    expect(system).toMatch(/bullets/);
    expect(system).toMatch(/wall of text|neformatiran odstavek/i);
    expect(system).toMatch(/weatherWidget/);
    expect(system).toMatch(/safetyWarning/);
    expect(system).toMatch(/JSON SCHEMA \(mandatory/);
    expect(system).toMatch(/DAY COUNT & DEPARTURE/);
    expect(system).toMatch(/EXACTLY match the inclusive calendar days/);
    expect(system).toMatch(/Day N \(the final day\) MUST ALWAYS be the departure day/);
    expect(system).toMatch(/VEČDRŽAVNA & SAFARI|MULTI-COUNTRY & SAFARI/);
    expect(system).toMatch(/FORBIDDEN: morning check-out|no morning dest/i);
    expect(system).toMatch(/NO PLACEHOLDERS \/ NO TRUNCATION/);
    expect(system).toMatch(/NO META-INSTRUCTIONS IN OUTPUT TEXT/);
    expect(system).toMatch(/Prtljago vzemi s seboj/);
    expect(system).toMatch(/Večerna odjava iz hotela in prevoz na letališče/);
    expect(system).toMatch(/fully completed description \(minimum 25 words\)/);
    expect(system).toMatch(/minimum 25 words/);
    expect(system).toMatch(/Never copy the origin international departure/);
    expect(system).toMatch(/prosti \/ lokalni dan/);
    expect(system).toMatch(/TRAVEL DAY RULE/);
    expect(system).toMatch(/Morning is reserved for travel\/transfer/);
    expect(system).toMatch(/STRICT GENERATION & FORMATTING CONSTRAINTS/);
    expect(system).toMatch(/no markdown code fences/);
    expect(system).toMatch(/time_slot/);
    expect(system).toMatch(/DOPOLDAN/);
    expect(system).toMatch(/transport_tip/);
    expect(system).toMatch(/transportTip/);
    expect(system).toMatch(/Phuket \(HKT\) → Krabi \/ Ao Nang/);
    expect(system).toMatch(/Koh Lanta has NO airport/);
    expect(system).toMatch(/Krabi \(KBV\)/);
    expect(system).toMatch(/ONLY when the overnight city changes/);
    expect(system).toMatch(/Cancún → Isla Mujeres → Playa del Carmen → Tulum/);
    expect(system).toMatch(/\(END_DATE − START_DATE\) \+ 1 = 16/);
    expect(system).not.toMatch(/Mae Klong|KURIRANA POT|Dan 1–3: Bangkok|Koh Lipe: NI neposrednega/i);
    expect(system).toMatch(/Popoldanski ogled v mestu \{city\}/);
    expect(system).toMatch(/PRVO bazo/);
    expect(system).toMatch(/1–2 “polna dneva” na hub/);
    expect(system).toMatch(/1 noč\(i\) Phuket/);
    expect(system).not.toMatch(/Notranji leti so dovoljeni šele ko potnik zapusti bazo prihoda po vsaj 1–2 polnih dneh tam/);
  });

  it("does not inject a curated destination template into the live prompt", () => {
    const system = tripPlanSystemPrompt(
      baseParams({
        destinationIata: "BKK",
        destination: "Bangkok",
        days: 15,
        departDate: "2026-10-16",
        returnDate: "2026-10-30",
        customWishes: "sproščeno, templji in plaže",
        flightContext: {
          outboundDepart: "15:00",
          outboundArrive: "07:00",
          outboundArriveDayOffset: 1,
          inboundDepart: "09:05",
          inboundArrive: "16:40",
        },
      }),
    );
    expect(system).toMatch(/SMSEL POTI|ROUTE SENSE/);
    expect(system).not.toMatch(/Dan 1–[34]: Bangkok/i);
    expect(system).toMatch(/Popoldanski ogled v mestu \{city\}/);
    expect(system).toMatch(/METROPOLA vs NOTRANJOST|tranzitna metropola/);
    expect(system).toMatch(/30 %/);
    expect(system).toMatch(/Chiang Mai/);
    expect(system).toMatch(/VEČTEDENSKO \/ MULTI-COUNTRY \/ SAFARI/);
    expect(system).toMatch(/največ 4 glavnih baz/);
    expect(system).toMatch(/VEČDRŽAVNA & SAFARI|4–6 glavnih baz/);
  });

  it("continuation batches ask only for remaining day_numbers and leftover destinations", () => {
    const block = dayRangePromptBlock(
      baseParams({
        dayRange: {
          start: 7,
          end: 12,
          lastCity: "Phuket",
          visitedCities: ["Phuket", "Khao Sok"],
        },
      }),
    );
    expect(block).toMatch(/day_number 7 do 12/);
    expect(block).toMatch(/natanko 6 day/);
    expect(block).toMatch(/Phuket/);
    expect(block).toMatch(/NISO med že obiskanimi/);

    const system = tripPlanSystemPrompt(
      baseParams({
        dayRange: {
          start: 7,
          end: 12,
          lastCity: "Phuket",
          visitedCities: ["Phuket"],
        },
      }),
    );
    expect(system).toMatch(/RAZPON DNI ZA TA JSON/);
    expect(system).toMatch(/THIS JSON CALL ONLY: emit day_number 7…12/);
    expect(system).not.toMatch(/FAZA 2|ZAKLENJENA MATRIKA BAZ/);
    expect(system).not.toMatch(/PRIHODOVNO LETALIŠČE \(OBVEZNO/);
  });
});
