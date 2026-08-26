import { describe, expect, it } from "vitest";
import { parseCoercedTripPlan } from "@/lib/geminiPro.shared";
import { tripPlanResponseToAiTripPlan } from "@/lib/geminiPlanMap";
import { normalizePlanForPdf } from "@/lib/pdf-export";
import { buildMapDay } from "@/lib/itineraryMapModel";
import { partialTripPlanToPreviewPlan } from "@/lib/geminiStreamMap";

const SLOT_COPY =
  "A complete visitor briefing with how to get there, a realistic duration, and one local tip that is actually usable on the ground without inventing a hotel name.";

function nestedGeminiDayPayload() {
  return {
    trip_metadata: {
      destination: "Thailand",
      season_warning: "October is the end of rainy season in Bangkok with hot afternoons.",
      currency: "EUR",
      visa_required: false,
    },
    itinerar: [
      {
        phase: "Bangkok",
        city: "Bangkok",
        unsplashQuery: "Bangkok",
        lat: 13.7563,
        lng: 100.5018,
        pois: [
          {
            name: "Grand Palace",
            description: "Royal complex on Rattanakosin Island.",
            lat: 13.75,
            lng: 100.492,
            unsplashQuery: "Grand Palace Bangkok",
            tripAdvisorStyleDetails: {
              highlights: ["Temple of the Emerald Buddha", "Royal courtyards"],
              proTip: "Cover shoulders and knees before you enter the inner court.",
              bestTimeOfDay: "morning",
              rating: 4.6,
              reviewSummary: "Crowded but the gilded halls and wat interiors are worth the early start.",
            },
          },
        ],
        days: [
          {
            day_number: 1,
            date: "2026-10-26",
            day_name: "Monday",
            title: "Arrival and first Bangkok evening",
            dailyBudget: 90,
            drivingDistanceKm: 0,
            drivingDurationHours: "0h",
            transportTip:
              "BTS Skytrain from Siam to Sanam Chai for the Grand Palace; after 20:00 use Grab because BTS is closed.",
            transfer: {
              type: "van",
              from: "Suvarnabhumi",
              to: "Bangkok",
              duration: "45min",
              cost_eur: 25,
            },
            activities: {
              morning: {
                title: "Overnight flight to Bangkok",
                description: SLOT_COPY,
                cost_eur: 0,
                time: "08:00",
                category: "airport",
              },
              afternoon: {
                title: "Wat Pho",
                description: SLOT_COPY,
                cost_eur: 8,
                time: "15:00",
                category: "sightseeing",
                coordinates: { lat: 13.746, lng: 100.493 },
              },
              evening: {
                title: "Yaowarat night market",
                description: SLOT_COPY,
                cost_eur: 20,
                time: "19:30",
                category: "food",
                coordinates: { lat: 13.7401, lng: 100.51 },
              },
            },
          },
        ],
      },
    ],
    logistics_and_tips: {
      transport: { flights: "BKK", ferries: "n/a", city_transport: "BTS and Grab" },
      finance: "EUR/THB",
      internet: "eSIM",
    },
    hotels: [],
  };
}

describe("Gemini nested slots → frontend / PDF / Mapbox", () => {
  it("maps morning/afternoon/evening + transportTip into DayPlan fields the PDF and map already read", () => {
    const parsed = parseCoercedTripPlan(nestedGeminiDayPayload());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const dayRaw = parsed.data.itinerar[0]!.days[0]!;
    expect(Array.isArray(dayRaw.activities)).toBe(true);
    expect(dayRaw.activities).toHaveLength(3);
    expect(dayRaw.transportTip).toMatch(/BTS Skytrain/);
    expect(dayRaw.transportation?.[0]).toMatchObject({
      type: "van",
      from: "Suvarnabhumi",
      to: "Bangkok",
    });
    expect(dayRaw.activities.find((a) => /Wat Pho/i.test(a.title))?.estimatedCostEur).toBe(8);
    expect(dayRaw.activities.find((a) => /Wat Pho/i.test(a.title))?.arrivalTime).toBe("15:00");

    const plan = tripPlanResponseToAiTripPlan(parsed.data, {
      language: "sl",
      departDate: "2026-10-26",
      originIata: "MUC",
      destinationIata: "BKK",
    });
    const day = plan.days[0]!;
    expect(day.city).toMatch(/Bangkok/i);
    expect(day.activities.morning.some((a) => /Overnight flight/i.test(a.name))).toBe(true);
    expect(day.activities.afternoon.some((a) => /Wat Pho/i.test(a.name))).toBe(true);
    expect(day.activities.evening.some((a) => /Yaowarat/i.test(a.name))).toBe(true);
    const watPho = day.activities.afternoon.find((a) => /Wat Pho/i.test(a.name))!;
    expect(watPho.arrivalTime).toBe("15:00");
    expect(watPho.priceLabel).toBe("€8");
    expect(watPho.estimatedCostEur).toBe(8);
    expect(watPho.lat).toBeCloseTo(13.746);
    expect(day.transportationTips).toMatch(/BTS Skytrain/);
    expect(day.transportation?.[0]).toMatchObject({
      type: "van",
      from: "Suvarnabhumi",
      to: "Bangkok",
    });
    expect(JSON.stringify(day)).not.toMatch(/Večer:\s*Večer/);

    const pdf = normalizePlanForPdf({
      title: "Skybooplan",
      destination: "Bangkok",
      start_date: "2026-10-26",
      end_date: "2026-10-26",
      itinerary: plan,
      language: "sl",
    });
    expect(pdf.days[0]!.slots.map((s) => s.label).length).toBeGreaterThanOrEqual(2);
    const pdfItems = pdf.days[0]!.slots.flatMap((s) => s.items);
    const pdfTitles = pdfItems.map((i) => i.title).join(" ");
    expect(pdfTitles).toMatch(/Wat Pho/);
    expect(pdfTitles).toMatch(/Yaowarat/);
    expect(pdfItems.find((i) => /Wat Pho/i.test(i.title))?.time).toMatch(/15:00/);
    expect(pdfItems.find((i) => /Wat Pho/i.test(i.title))?.price).toBe("€8");
    expect(pdf.days[0]!.transportTips).toMatch(/BTS Skytrain/);
    expect(pdf.days[0]!.transportation.some((t) => t.from === "Suvarnabhumi")).toBe(true);
    expect(JSON.stringify(pdf.days[0])).not.toMatch(/Večer:\s*Večer/);

    const mapDay = buildMapDay(plan, 1);
    expect(mapDay).toBeTruthy();
    expect(mapDay!.pins.length).toBeGreaterThan(0);
    expect(mapDay!.pins.length).toBeLessThanOrEqual(4);
    expect(mapDay!.pins.some((p) => /Wat Pho|Yaowarat/i.test(p.name))).toBe(true);
    expect(mapDay!.center.lat).toBeGreaterThan(0);
    expect(mapDay!.cityLabel).toMatch(/Bangkok/i);
  });

  it("drops Večer: Večer slot titles and still centers Mapbox on day.city", () => {
    const raw = nestedGeminiDayPayload();
    const day = raw.itinerar[0]!.days[0]!;
    day.activities.evening = {
      title: "Večer",
      description: "Večer",
      cost_eur: 0,
      time: "evening",
      category: "sightseeing",
    };
    day.activities.afternoon = {
      title: "Wat Pho",
      description: SLOT_COPY,
      cost_eur: 8,
      time: "15:00",
      category: "sightseeing",
    };

    const parsed = parseCoercedTripPlan(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.itinerar[0]!.days[0]!.activities.some((a) => /Večer/i.test(a.title))).toBe(
      false,
    );

    const plan = tripPlanResponseToAiTripPlan(parsed.data, {
      language: "sl",
      departDate: "2026-10-26",
      originIata: "MUC",
      destinationIata: "BKK",
    });
    expect(plan.days[0]!.activities.evening).toEqual([]);
    expect(plan.days[0]!.evening).not.toMatch(/Večer:\s*Večer/);
    expect(plan.days[0]!.city).toMatch(/Bangkok/i);

    const mapDay = buildMapDay(plan, 1);
    expect(mapDay).toBeTruthy();
    expect(mapDay!.center.lat).toBeGreaterThan(13);
    expect(mapDay!.cityLabel).toMatch(/Bangkok/i);
  });

  it("maps nested cost_eur, time, and transfer in the stream preview without inventing 09:00", () => {
    const preview = partialTripPlanToPreviewPlan(nestedGeminiDayPayload(), {
      language: "sl",
      originIata: "MUC",
      destinationIata: "BKK",
      enrich: false,
    });
    expect(preview).toBeTruthy();
    const day = preview!.days[0]!;
    const watPho = day.activities.afternoon.find((a) => /Wat Pho/i.test(a.name));
    expect(watPho?.arrivalTime).toBe("15:00");
    expect(watPho?.priceLabel).toBe("€8");
    expect(day.transportation?.[0]?.from).toBe("Suvarnabhumi");
    expect(JSON.stringify(day.activities)).not.toMatch(/09:00/);
  });

  it("parses a slim 2-day Gemini payload without POIs, logistics, or TripAdvisor blocks", () => {
    const slim = {
      trip_metadata: { destination: "Bangkok" },
      itinerar: [
        {
          city: "Bangkok",
          days: [
            {
              day_number: 1,
              title: "Prihod",
              activities: {
                morning: { title: "Let v Bangkok", description: SLOT_COPY },
                afternoon: { title: "Wat Pho", description: SLOT_COPY, cost_eur: 8, time: "15:00" },
                evening: { title: "Yaowarat", description: SLOT_COPY },
              },
            },
            {
              day_number: 2,
              title: "Mesto",
              activities: {
                morning: { title: "Grand Palace", description: SLOT_COPY },
              },
            },
          ],
        },
      ],
    };
    const parsed = parseCoercedTripPlan(slim);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.itinerar[0]!.days).toHaveLength(2);
    const preview = partialTripPlanToPreviewPlan(slim, {
      language: "sl",
      originIata: "MUC",
      destinationIata: "BKK",
      enrich: false,
    });
    expect(preview?.days).toHaveLength(2);
    expect(preview!.days[0]!.activities.afternoon.some((a) => /Wat Pho/i.test(a.name))).toBe(true);
  });

  it("streams a preview day before Gemini finishes city, title, or pois", () => {
    const preview = partialTripPlanToPreviewPlan(
      {
        trip_metadata: {
          destination: "Bangkok",
          season_warning: "Hot",
          currency: "EUR",
          visa_required: false,
        },
        itinerar: [
          {
            days: [
              {
                day_number: 1,
                activities: {
                  morning: {
                    title: "Wat Pho",
                    description: SLOT_COPY,
                    category: "sightseeing",
                  },
                },
              },
            ],
          },
        ],
      },
      {
        language: "sl",
        originIata: "MUC",
        destinationIata: "BKK",
        enrich: false,
      },
    );
    expect(preview?.days).toHaveLength(1);
    expect(preview!.days[0]!.city).toMatch(/Bangkok/i);
    expect(preview!.days[0]!.title).toMatch(/Dan 1/);
    expect(preview!.days[0]!.activities.morning.some((a) => /Wat Pho/i.test(a.name))).toBe(true);
  });
});
