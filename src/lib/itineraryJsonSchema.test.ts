import { describe, expect, it } from "vitest";
import { ITINERARY_JSON_SCHEMA_RULE, liftFlatItineraryToItinerar } from "@/lib/itineraryJsonSchema";
import { parseCoercedTripPlan, tripPlanGeminiSchema } from "@/lib/geminiPro.shared";
import { itineraryHacksAndTransportRules, tripPlanSystemPrompt } from "@/lib/geminiPro";
import type { GenerateTripPlanParams } from "@/lib/geminiPro.shared";
import type { ActivityItem, DayPlan } from "@/lib/itineraryDayContract";

describe("official ActivityItem / DayPlan JSON contract", () => {
  const activity = {
    time_slot: "DOPOLDAN",
    start_time: "10:00",
    title: "High Line",
    description: "Sprehod od 14th Street do Hudson Yards.",
  } satisfies ActivityItem;

  const day = {
    day_number: 1,
    date: "19. sep. 2026",
    city: "New York",
    day_title: "Prihod v New York in prvi vtis",
    daily_budget_per_person_eur: 75,
    activities: [activity],
    local_tips: "The Met zahteva časovni vstop.",
    transport_tip: "OMNY / contactless na podzemni.",
  } satisfies DayPlan;

  it("is the live Gemini structured-output day shape", () => {
    expect(tripPlanGeminiSchema.safeParse({ days: [day] }).success).toBe(true);
  });

  it("rejects nested morning/afternoon/evening activity objects", () => {
    expect(
      tripPlanGeminiSchema.safeParse({
        days: [{ ...day, activities: { morning: [activity] } }],
      }).success,
    ).toBe(false);
  });
});

describe("itinerary JSON schema contract", () => {
  it("embeds Rok's field names in the designer prompt", () => {
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"trip_title"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"overview"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"total_budget_eur"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"day_number"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/days\[\]\.transfer/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/ONLY when the overnight city changes/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/FORBIDDEN: transfer\/transportation\[\] for same-city day trips/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/cost_eur/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"daily_budget_per_person_eur"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"accommodations"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/Never a freeform itinerary essay|never a freeform itinerary essay/i);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/Day N is ALWAYS the departure day/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/Red-eye boarded on N−1/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/EXACTLY the inclusive calendar days/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/minimum 25 words/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/time_slot DOPOLDAN = travel\/transfer only/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/POPOLDAN\/VEČER after hotel check-in/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"day_title"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"time_slot"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/DOPOLDAN/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"start_time"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"estimated_cost_eur"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"navigation_available"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"transport_tip"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/MUST NOT embed a clock tag/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/strictly valid, parseable JSON/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/no markdown code fences/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/conversational intro\/outro/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/ALWAYS the overnight sleep city/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/Shinkansen Osaka→Tokyo|morning\/daytime hop/i);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/"local_tips"/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/REQUIRED \(type: string\) every day/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/2–3 short practical tips/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/Temple\/wat dress ONLY/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/Broadway etiquette/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/nights per city in wishes/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/multi-night stay/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/transit metropolis/);
    expect(ITINERARY_JSON_SCHEMA_RULE).toMatch(/≤30%/);
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

  it("lifts the live day contract (flat activities, day_title, transport_tip)", () => {
    const lifted = liftFlatItineraryToItinerar({
      trip_title: "MUC → NYC",
      overview: "Prihod v New York in prvi vtis mesta.",
      days: [
        {
          day_number: 1,
          date: "19. sep. 2026",
          city: "New York",
          day_title: "Prihod v New York in prvi vtis",
          daily_budget_per_person_eur: 75,
          activities: [
            {
              time_slot: "DOPOLDAN",
              start_time: "10:00",
              title: "Kratek in udaren naslov",
              description: "Sprehod po High Line od 14th Street do Hudson Yards. Prihod ob 10:00, potem Times Square.",
              estimated_cost_eur: 25,
              navigation_available: true,
            },
            {
              time_slot: "POPOLDAN",
              start_time: "14:00",
              title: "The Met",
              description: "Rezerviraj časovni vstop. Fokus na evropsko slikarstvo, ne na celoten muzej.",
              estimated_cost_eur: 30,
              navigation_available: true,
            },
            {
              time_slot: "VEČER",
              start_time: "19:00",
              title: "Joe's Pizza",
              description: "Klasika na Carmine Street. Pridi pred vrsto, vzemi rezino in jej stoje.",
              estimated_cost_eur: 18,
              navigation_available: true,
            },
          ],
          local_tips: "The Met zahteva časovni vstop.",
          transport_tip: "OMNY / contactless na podzemni — ne kupuj MetroCard.",
        },
      ],
    }) as {
      itinerar: Array<{
        days: Array<{
          title: string;
          transportTip?: string;
          activities: Array<{
            title: string;
            timeSlot: string;
            arrivalTime?: string;
            estimatedCostEur: number;
            description: string;
            navigationAvailable?: boolean;
          }>;
        }>;
      }>;
    };

    const d1 = lifted.itinerar[0]!.days[0]!;
    expect(d1.title).toBe("Prihod v New York in prvi vtis");
    expect(d1.transportTip).toMatch(/OMNY/);
    expect(d1.activities.map((a) => a.timeSlot)).toEqual(["dopoldan", "popoldan", "vecer"]);
    expect(d1.activities[0]!.arrivalTime).toBe("10:00");
    expect(d1.activities[0]!.estimatedCostEur).toBe(25);
    expect(d1.activities[0]!.navigationAvailable).toBe(true);
    expect(d1.activities[0]!.description).not.toMatch(/\d{1,2}:\d{2}/);
    expect(parseCoercedTripPlan(lifted).success).toBe(true);
  });

  it("strips markdown table pipes from titles and start_time so clocks parse", () => {
    const lifted = liftFlatItineraryToItinerar({
      trip_title: "NYC",
      overview: "Clean JSON fields without markdown table pipes.",
      days: [
        {
          day_number: 1,
          date: "19. sep. 2026",
          city: "New York",
          day_title: "Prihod",
          daily_budget_per_person_eur: 75,
          activities: [
            {
              time_slot: "DOPOLDAN",
              start_time: "| 10:00 |",
              title: "| High Line |",
              description: "Sprehod po High Line od 14th Street do Hudson Yards.",
              estimated_cost_eur: 0,
              navigation_available: true,
            },
          ],
          local_tips: "The Met zahteva časovni vstop.",
          transport_tip: "OMNY.",
        },
      ],
    }) as {
      itinerar: Array<{
        days: Array<{ activities: Array<{ title: string; arrivalTime?: string; time?: string }> }>;
      }>;
    };
    const a = lifted.itinerar[0]!.days[0]!.activities[0]!;
    expect(a.title).toBe("High Line");
    expect(a.title).not.toMatch(/\|/);
    expect(a.arrivalTime ?? a.time).toBe("10:00");
  });

  it("rewrites LaTeX temperatures in activity titles", () => {
    const lifted = liftFlatItineraryToItinerar({
      trip_title: "NYC",
      overview: "Clean JSON fields without LaTeX degrees.",
      days: [
        {
          day_number: 1,
          date: "19. sep. 2026",
          city: "New York",
          day_title: "Prihod",
          daily_budget_per_person_eur: 75,
          activities: [
            {
              time_slot: "DOPOLDAN",
              start_time: "10:00",
              title: "Sprehod pri $30^{\\circ}C$",
              description: "Toplo dopoldne, voda in kapa.",
              estimated_cost_eur: 0,
              navigation_available: true,
            },
          ],
          local_tips: "The Met zahteva časovni vstop.",
          transport_tip: "OMNY.",
        },
      ],
    }) as {
      itinerar: Array<{ days: Array<{ activities: Array<{ title: string }> }> }>;
    };
    expect(lifted.itinerar[0]!.days[0]!.activities[0]!.title).toBe("Sprehod pri 30°C");
  });

  it("keeps the overnight city when a middle day flickers to another hub without a hop", () => {
    const slot = (title: string) => ({
      title,
      description: "A complete visitor briefing with how to get there and one local tip.",
      cost_eur: 10,
    });
    const lifted = liftFlatItineraryToItinerar({
      trip_title: "Stay",
      overview: "Overnight city must stay consistent during a stay.",
      days: [
        {
          day_number: 10,
          date: "2026-11-04",
          city: "Phuket",
          title: "Beaches",
          daily_budget_per_person_eur: 55,
          activities: { morning: slot("Morning"), afternoon: slot("Afternoon"), evening: slot("Dinner") },
        },
        {
          day_number: 11,
          date: "2026-11-05",
          city: "Bangkok",
          title: "Wrong hub",
          daily_budget_per_person_eur: 55,
          activities: { morning: slot("Morning"), afternoon: slot("Afternoon"), evening: slot("Dinner") },
        },
        {
          day_number: 12,
          date: "2026-11-06",
          city: "Phuket",
          title: "Beaches again",
          daily_budget_per_person_eur: 55,
          activities: { morning: slot("Morning"), afternoon: slot("Afternoon"), evening: slot("Dinner") },
        },
      ],
    }) as { itinerar: Array<{ days: Array<{ day_number: number; city: string }> }> };

    const days = lifted.itinerar.flatMap((p) => p.days);
    const d11 = days.find((d) => d.day_number === 11);
    expect(d11?.city).toBe("Phuket");
  });

  it("stamps overnight towns from hotels[] when every day copied the gateway city", () => {
    const slot = (title: string) => ({
      title,
      description: "A complete visitor briefing with how to get there and one local tip.",
      cost_eur: 10,
    });
    const day = (n: number, date: string) => ({
      day_number: n,
      date,
      city: "Denpasar",
      daily_budget_per_person_eur: 70,
      activities: { morning: slot("Morning"), afternoon: slot("Afternoon"), evening: slot("Dinner") },
    });
    const lifted = liftFlatItineraryToItinerar({
      trip_title: "Island hop",
      overview: "Overnight city must be the stay town, not the arrival airport city.",
      days: [
        day(1, "2026-07-24"),
        day(2, "2026-07-25"),
        day(3, "2026-07-26"),
        day(4, "2026-07-27"),
        day(5, "2026-07-28"),
        day(6, "2026-07-29"),
      ],
      hotels: [
        { city: "Seminyak", nights: 2 },
        { city: "Ubud", nights: 2 },
        { city: "Amed", nights: 1 },
      ],
    }) as { itinerar: Array<{ days: Array<{ day_number: number; city: string; title: string }> }> };

    const cities = lifted.itinerar.flatMap((p) => p.days).map((d) => d.city);
    expect(cities.slice(0, 5)).toEqual(["Seminyak", "Seminyak", "Ubud", "Ubud", "Amed"]);
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
    expect(system).toMatch(/local_tips/);
    expect(system).toMatch(/2–3 short practical tips/);
    expect(itineraryHacksAndTransportRules("EUR")).toMatch(/days\[\]\.local_tips/);
    expect(itineraryHacksAndTransportRules("EUR")).toMatch(/2–3 kratki nasveti/);
    expect(itineraryHacksAndTransportRules("EUR")).toMatch(/oblačenje v templjih/);
    expect(itineraryHacksAndTransportRules("EUR")).toMatch(/Broadway/);
  });
});
