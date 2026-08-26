import { describe, expect, it } from "vitest";
import { ITINERARY_JSON_SCHEMA_RULE, liftFlatItineraryToItinerar } from "@/lib/itineraryJsonSchema";
import { parseCoercedTripPlan } from "@/lib/geminiPro.shared";
import { tripPlanSystemPrompt } from "@/lib/geminiPro";
import type { GenerateTripPlanParams } from "@/lib/geminiPro.shared";

describe("itinerary JSON schema contract", () => {
  it("embeds Rok's field names in the designer prompt", () => {
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"trip_title"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"overview"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"total_budget_eur"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"day_number"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"transfer"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"cost_eur"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"daily_budget_per_person_eur"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"accommodations"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/Never a freeform itinerary essay|never a freeform itinerary essay/i);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/Day N is ALWAYS the departure day/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/EXACTLY the inclusive calendar days/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/minimum 25 words/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/morning = travel\/transfer only/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/afternoon\/evening after hotel check-in/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/strictly valid, parseable JSON/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/no markdown code fences/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/conversational intro\/outro/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/NEVER '\.\.\.' or cut off mid-word|placeholders, unfinished titles/);
  });

  it("lifts a flat schema into itinerar[] so PDF can read slots", () => {
    const lifted = liftFlatItineraryToItinerar({
      trip_title: "MUC → NYC",
      overview: "19-dnevno potovanje po ZDA z zaključenimi dnevi.",
      total_budget_eur: 4200,
      days: [
        {
          day_number: 1,
          date: "2026-07-24",
          city: "New York",
          title: "Prihod v New York",
          activities: {
            morning: {
              title: "Top of the Rock",
              description: "Razgled z Rockefeller Center. Vstopnico kupi online.",
              cost_eur: 45,
              time: "10:00",
            },
            afternoon: {
              title: "Central Park",
              description: "Sprehod od The Mall do Belvedere. Izogibaj se kočijam.",
              cost_eur: 0,
              time: "14:00",
            },
            evening: {
              title: "Večerja: Joe's Pizza",
              description: "Klasika na Carmine Street. Pridi pred 19:00.",
              cost_eur: 18,
              time: "19:00",
            },
          },
          daily_budget_per_person_eur: 95,
        },
        {
          day_number: 2,
          date: "2026-07-25",
          city: "Philadelphia",
          title: "New York → Philadelphia",
          transfer: {
            type: "train",
            from: "New York",
            to: "Philadelphia",
            duration: "1h 20min",
            cost_eur: 55,
          },
          activities: {
            morning: {
              title: "Amtrak Northeast Regional",
              description: "Odhod s Penn Station. Sedi na desni strani za Hudson.",
              cost_eur: 55,
              time: "09:00",
            },
          },
          daily_budget_per_person_eur: 80,
        },
      ],
      accommodations: [
        { city: "New York", nights: 1, from_date: "2026-07-24", to_date: "2026-07-25" },
        { city: "Philadelphia", nights: 1, from_date: "2026-07-25", to_date: "2026-07-26" },
      ],
    }) as {
      itinerar: Array<{
        city: string;
        days: Array<{
          activities: Array<{ title: string; timeSlot: string; estimatedCostEur: number }>;
          transportation?: Array<{ type: string; from: string; to: string }>;
          dailyBudget: number;
        }>;
      }>;
      hotels: Array<{ city?: string; nights?: number }>;
      trip_metadata: { destination: string; season_warning: string };
    };

    expect(lifted.trip_metadata.destination).toBe("MUC → NYC");
    expect(lifted.trip_metadata.season_warning).toMatch(/ZDA/);
    expect(lifted.itinerar).toHaveLength(2);
    expect(lifted.itinerar[0]!.city).toBe("New York");
    const d1 = lifted.itinerar[0]!.days[0]!;
    expect(d1.activities.map((a) => a.title)).toEqual([
      "Top of the Rock",
      "Central Park",
      "Večerja: Joe's Pizza",
    ]);
    expect(d1.activities[0]!.timeSlot).toBe("dopoldan");
    expect(d1.activities[0]!.estimatedCostEur).toBe(45);
    expect(d1.dailyBudget).toBe(95);
    const d2 = lifted.itinerar[1]!.days[0]!;
    expect(d2.transportation?.[0]).toMatchObject({
      type: "train",
      from: "New York",
      to: "Philadelphia",
    });
    expect(lifted.hotels.map((h) => h.city)).toEqual(["New York", "Philadelphia"]);

    const parsed = parseCoercedTripPlan(lifted);
    expect(parsed.success).toBe(true);
  });
});

describe("tripPlanSystemPrompt JSON contract", () => {
  it("requires the itinerary JSON schema in the system prompt", () => {
    const params: GenerateTripPlanParams = {
      originIata: "MUC",
      destinationIata: "JFK",
      destination: "USA",
      month: "julij",
      days: 10,
      departDate: "2026-07-24",
      returnDate: "2026-08-02",
      pax: { adults: 2, childrenAges: [] },
      budget: "standard",
      wishTags: [],
      language: "sl",
      currency: "EUR",
    };
    const system = tripPlanSystemPrompt(params);
    expect(system).toMatch(/trip_title/);
    expect(system).toMatch(/accommodations/);
    expect(system).toMatch(/daily_budget_per_person_eur/);
    expect(system).toMatch(/freeform itinerary essay/i);
    expect(system).toMatch(/minimum 25 words/);
    expect(system).toMatch(/weatherWidget/);
    expect(system).toMatch(/safetyWarning/);
  });
});
