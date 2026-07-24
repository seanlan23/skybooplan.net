import { describe, expect, it } from "vitest";
import { generatePlanPdf } from "@/lib/pdf-export";

describe("generatePlanPdf motorhome", () => {
  it("builds a PDF for a 10-day motorhome Croatia plan", async () => {
    const cities = ["Carinthia", "Split", "Split", "Šibenik", "Šibenik", "Zadar", "Zadar", "Plitvice Lakes National Park", "Postojna", "Carinthia"];
    const result = await generatePlanPdf({
      title: "Avtodom: Carinthia → Croatia",
      destination: "Hrvaška",
      start_date: "2026-08-14",
      end_date: "2026-08-24",
      language: "sl",
      pax: 2,
      itinerary: {
        summary: "Potovanje z avtodomom: Carinthia → Split → Šibenik → Zadar → Plitvice → Postojna → Carinthia. 🚐",
        destinationName: "Hrvaška",
        totalBudgetEur: 2006,
        groundTransportMode: "motorhome",
        accommodationMode: "motorhome",
        originPlace: "Carinthia, AT",
        destinationPlace: "Croatia",
        days: cities.map((city, i) => ({
          day: i + 1,
          date: `2026-08-${String(14 + i).padStart(2, "0")}`,
          title: `${city} — dan z avtodomom`,
          city,
          dailyBudgetEur: 100,
          drivingDistanceKm: i === 1 ? 420 : 80,
          transportationTips: "Parkiraj izven središča.",
          activities: {
            morning: [{ name: `Kamp pri ${city}`, description: "Zajtrk v avtodomu 🍳 in sprehod." }],
            afternoon: [{ name: `Ogled — ${city}`, description: "Mesto / narava." }],
            evening: [{ name: "Večerja", description: "Lokalna hrana €15–25." }],
          },
        })),
      },
    });
    expect(result.fileName).toMatch(/\.pdf$/i);
    expect(result.buffer.byteLength).toBeGreaterThan(1000);
  });
});
