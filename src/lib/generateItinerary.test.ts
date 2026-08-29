import { describe, expect, it } from "vitest";
import { CORE_ITINERARY_SYSTEM_RULES, itineraryJsonToPlan } from "@/lib/generateItinerary";
import type { GenerateItineraryInput } from "@/lib/generateItinerary";

const SLOT =
  "A complete visitor briefing with how to get there, a realistic duration, and one local tip that is actually usable on the ground without inventing a hotel name.";

function input(): GenerateItineraryInput {
  return {
    originIata: "MUC",
    destinationIata: "BKK",
    destinationPlace: undefined,
    departDate: "2026-10-26",
    returnDate: "2026-10-27",
    pax: { adults: 2, childrenAges: [] },
    budget: "standard",
    wishTags: [],
    language: "sl",
    currency: "EUR",
  };
}

describe("CORE_ITINERARY_SYSTEM_RULES", () => {
  it("exports the four live sleep-city / clock / leak / transfer rules", () => {
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/CORE SYSTEM RULES/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/SLEEPS that night/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/strictly increasing clock order/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/NO META-INSTRUCTIONS/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/EXACTLY once per day/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/ISLAND HOPS/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/Busuanga \(USU\)/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/Cebu → Malapascua/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/UNIQUE LOCAL TIPS/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/Valencia→Vienna/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/12\+ hours/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/2 potnika/);
    expect(CORE_ITINERARY_SYSTEM_RULES).toMatch(/\$9\/11\$/);
  });
});

describe("itineraryJsonToPlan", () => {
  it("maps structured JSON onto DayPlan fields without inventing extra days", () => {
    const raw = {
      trip_metadata: {
        destination: "Thailand",
        season_warning: "Hot afternoons in late October.",
        currency: "EUR",
        visa_required: false,
      },
      weatherWidget: { season: "rainy", avgTemp: "30°C", clothing: "light" },
      safetyWarning: null,
      itinerar: [
        {
          city: "Bangkok",
          lat: 13.7563,
          lng: 100.5018,
          days: [
            {
              day_number: 1,
              date: "2026-10-26",
              title: "Arrival in Bangkok",
              city: "Bangkok",
              daily_budget_per_person_eur: 48,
              transportTip: "Airport rail link to Phaya Thai, then BTS to Siam.",
              local_tips:
                "Do not drink tap water in Bangkok; buy sealed bottles. Street food is safer at busy stalls. Watch bags on BTS. Cover shoulders at temples; tipping is not expected.",
              activities: {
                morning: {
                  title: "Overnight flight",
                  description: SLOT,
                  cost_eur: 0,
                },
                afternoon: {
                  title: "Wat Pho",
                  description: SLOT,
                  cost_eur: 8,
                },
                evening: {
                  title: "Yaowarat",
                  description: SLOT,
                  cost_eur: 20,
                },
              },
            },
          ],
        },
      ],
    };

    const plan = itineraryJsonToPlan(raw, input());
    expect(plan).not.toBeNull();
    expect(plan!.days).toHaveLength(1);
    expect(plan!.days[0]!.city).toMatch(/Bangkok/i);
    expect(plan!.days[0]!.activities?.afternoon?.[0]?.name).toMatch(/Wat Pho/i);
    expect(plan!.days[0]!.activities?.morning?.length).toBeGreaterThan(0);
    expect(plan!.days[0]!.activities?.evening?.length).toBeGreaterThan(0);
    expect(plan!.days[0]!.dailyBudgetEur).toBe(48);
    expect(plan!.days[0]!.localTips).toMatch(/tap water|templ/i);
    expect(JSON.stringify(plan)).not.toMatch(/prosti \/ lokalni dan/i);
  });

  it("strips tropical tips on a New York day and fixes Slovenian copy", () => {
    const raw = {
      trip_metadata: {
        destination: "New York",
        season_warning: "Cool evenings.",
        currency: "EUR",
        visa_required: false,
      },
      weatherWidget: { season: "mild", avgTemp: "18°C", clothing: "layers" },
      safetyWarning: null,
      itinerar: [
        {
          city: "New York",
          lat: 40.7128,
          lng: -74.006,
          days: [
            {
              day_number: 1,
              date: "2026-10-26",
              title: "Memorial $9/11$",
              city: "New York",
              daily_budget_per_person_eur: 90,
              transportTip: "OMNY / contactless on subway.",
              local_tips:
                "Do not drink tap water. Street food is safer at busy stalls. Reserve The Met timed entry. Za 2 potnikov.",
              activities: {
                morning: {
                  title: "9/11 Memorial",
                  description: `${SLOT} Spomin na $9/11$. Jedi morske sadeve.`,
                  cost_eur: 0,
                },
                afternoon: {
                  title: "The Met",
                  description: SLOT,
                  cost_eur: 25,
                },
                evening: {
                  title: "Broadway",
                  description: SLOT,
                  cost_eur: 40,
                },
              },
            },
          ],
        },
      ],
    };

    const plan = itineraryJsonToPlan(raw, {
      ...input(),
      destinationIata: "JFK",
      destinationPlace: "New York",
    });
    expect(plan).not.toBeNull();
    expect(plan!.days[0]!.city).toMatch(/New York/i);
    expect(plan!.days[0]!.title).toMatch(/9\/11/);
    expect(plan!.days[0]!.title).not.toMatch(/\$9\/11\$/);
    expect(plan!.days[0]!.localTips).toMatch(/The Met/i);
    expect(plan!.days[0]!.localTips).not.toMatch(/tap water|street food is safer/i);
    expect(plan!.days[0]!.localTips).toMatch(/2 potnika/);
    expect(JSON.stringify(plan)).toMatch(/morske sadeže/);
    expect(JSON.stringify(plan)).not.toMatch(/morske sadeve/);
  });

  it("maps the live day contract onto DayPlan slots", () => {
    const raw = {
      trip_title: "MUC → NYC",
      overview: "Prihod in prvi vtis.",
      weatherWidget: { season: "mild", avgTemp: "18°C", clothing: "layers" },
      safetyWarning: null,
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
              title: "High Line",
              description: `${SLOT} Sprehod od 14th Street do Hudson Yards.`,
              estimated_cost_eur: 0,
              navigation_available: true,
            },
            {
              time_slot: "POPOLDAN",
              start_time: "14:00",
              title: "The Met",
              description: SLOT,
              estimated_cost_eur: 30,
              navigation_available: true,
            },
            {
              time_slot: "VEČER",
              start_time: "19:00",
              title: "Broadway",
              description: SLOT,
              estimated_cost_eur: 40,
              navigation_available: true,
            },
          ],
          local_tips: "The Met zahteva časovni vstop.",
          transport_tip: "OMNY / contactless na podzemni.",
        },
      ],
    };

    const plan = itineraryJsonToPlan(raw, {
      ...input(),
      destinationIata: "JFK",
      destinationPlace: "New York",
    });
    expect(plan).not.toBeNull();
    expect(plan!.days[0]!.title).toMatch(/Prihod v New York/);
    expect(plan!.days[0]!.city).toMatch(/New York/i);
    expect(plan!.days[0]!.activities?.morning?.[0]?.name).toMatch(/High Line/i);
    expect(plan!.days[0]!.activities?.morning?.[0]?.arrivalTime).toBe("10:00");
    expect(plan!.days[0]!.activities?.afternoon?.[0]?.name).toMatch(/The Met/i);
    expect(plan!.days[0]!.activities?.evening?.[0]?.name).toMatch(/Broadway/i);
    expect(plan!.days[0]!.dailyBudgetEur).toBe(75);
    expect(plan!.days[0]!.transportationTips).toMatch(/OMNY/i);
    expect(plan!.days[0]!.localTips).toMatch(/The Met/i);
  });

  it("locks wish-list nights and drops a day trip to an overnight island", () => {
    const slot = {
      title: "Local sightseeing",
      description: SLOT,
      cost_eur: 20,
    };
    const raw = {
      trip_metadata: {
        destination: "Phuket",
        season_warning: "Warm Andaman evenings after the rains.",
        currency: "EUR",
        visa_required: false,
      },
      weatherWidget: { season: "rainy", avgTemp: "29°C", clothing: "light" },
      safetyWarning: null,
      itinerar: [
        {
          city: "Phuket",
          lat: 7.8804,
          lng: 98.3923,
          days: [
            {
              day_number: 1,
              date: "2026-10-26",
              title: "Phi Phi z gliserjem",
              city: "Phuket",
              daily_budget_per_person_eur: 80,
              transportTip: "Grab around Patong and the west-coast beaches.",
              local_tips: SLOT,
              activities: {
                morning: {
                  title: "Celodnevni izlet z gliserjem na Koh Phi Phi",
                  description: `${SLOT} Speedboat day trip to Maya Bay.`,
                  cost_eur: 90,
                },
                afternoon: slot,
                evening: slot,
              },
            },
            {
              day_number: 2,
              date: "2026-10-27",
              title: "Še Phuket",
              city: "Phuket",
              daily_budget_per_person_eur: 55,
              transportTip: "Grab or tuk-tuk between beaches and Old Town.",
              local_tips: SLOT,
              activities: { morning: slot, afternoon: slot, evening: slot },
            },
            {
              day_number: 3,
              date: "2026-10-28",
              title: "Phi Phi 1",
              city: "Koh Phi Phi",
              daily_budget_per_person_eur: 55,
              transportTip: "Longtail boats along the island; walk the village.",
              local_tips: SLOT,
              activities: { morning: slot, afternoon: slot, evening: slot },
            },
            {
              day_number: 4,
              date: "2026-10-29",
              title: "Phi Phi 2",
              city: "Koh Phi Phi",
              daily_budget_per_person_eur: 55,
              transportTip: "Longtail boats along the island; walk the village.",
              local_tips: SLOT,
              activities: { morning: slot, afternoon: slot, evening: slot },
            },
            {
              day_number: 5,
              date: "2026-10-30",
              title: "Odhod",
              city: "Koh Phi Phi",
              daily_budget_per_person_eur: 40,
              transportTip: "Ferry to the mainland then a van to the airport.",
              local_tips: SLOT,
              activities: { morning: slot, afternoon: slot, evening: slot },
            },
          ],
        },
      ],
    };

    const plan = itineraryJsonToPlan(raw, {
      ...input(),
      destinationIata: "HKT",
      returnDate: "2026-10-30",
      customWishes: "1 noč Phuket, 1 noč Ao Nang, 2 noči Koh Phi Phi",
    });
    expect(plan).not.toBeNull();
    expect(plan!.days[0]!.city).toMatch(/Phuket/i);
    expect(plan!.days[1]!.city).toMatch(/Ao Nang/i);
    expect(plan!.days[2]!.city).toMatch(/Phi Phi/i);
    expect(plan!.days[3]!.city).toMatch(/Phi Phi/i);
    expect(plan!.hotels?.map((h) => [h.city, h.nights])).toEqual([
      ["Phuket", 1],
      ["Ao Nang", 1],
      ["Koh Phi Phi", 2],
    ]);
    expect(plan!.days[0]!.activities?.morning?.[0]?.name).toMatch(/Lokalni ogled Phuket/i);
    expect(plan!.days[0]!.activities?.morning?.[0]?.name).not.toMatch(/gliser|Phi Phi/i);
  });
});
