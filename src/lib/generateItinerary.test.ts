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
