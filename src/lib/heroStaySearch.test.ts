import { describe, expect, it } from "vitest";
import { stayDestinationLabel, staySearchFromCollected } from "@/lib/heroStaySearch";

describe("stayDestinationLabel", () => {
  it("strips emoji and IATA", () => {
    expect(stayDestinationLabel("🏝️ Thailand")).toBe("Thailand");
    expect(stayDestinationLabel("Bangkok (BKK)")).toBe("Bangkok");
  });
});

describe("staySearchFromCollected", () => {
  it("builds Booking search params from hero chat answers", () => {
    const stay = staySearchFromCollected(
      {
        destination: "🏝️ Thailand",
        dates: "16. jul → 23. jul 2026", // SL range label from calendar
        nights: "",
        origin: "",
        passengers: "2 odrasla · 2 sobi",
        rooms: 2,
        pace: "",
        budget: "",
      },
      "sl",
    );
    expect(stay.city).toBe("Thailand");
    expect(stay.checkIn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stay.checkOut > stay.checkIn).toBe(true);
    expect(stay.adults).toBe(2);
    expect(stay.rooms).toBe(2);
  });

  it("reads rooms from the passenger label when rooms field is missing", () => {
    const stay = staySearchFromCollected(
      {
        destination: "Piran",
        dates: "2. nov → 4. nov 2026",
        nights: "",
        origin: "",
        passengers: "2 odrasla · 3 sobe",
        pace: "",
        budget: "",
      },
      "sl",
    );
    expect(stay.rooms).toBe(3);
  });

  it("keeps Slovenia as a country-wide stay search", () => {
    const stay = staySearchFromCollected(
      {
        destination: "🇸🇮 Slovenia",
        dates: "15. nov → 16. nov 2026",
        nights: "",
        origin: "",
        passengers: "2 odrasla · 1 soba",
        rooms: 1,
        pace: "",
        budget: "",
      },
      "sl",
    );
    expect(stay.city).toBe("Slovenia");
  });

  it("extracts cabin + jacuzzi from a vibe query and keeps the country", () => {
    const stay = staySearchFromCollected(
      {
        destination: "koča v naravi z jacuzzijem v Sloveniji",
        dates: "15. nov → 16. nov 2026",
        nights: "",
        origin: "",
        passengers: "2 odrasla · 1 soba",
        rooms: 1,
        pace: "",
        budget: "",
      },
      "sl",
    );
    expect(stay.city).toBe("Slovenia");
    expect(stay.filters).toMatchObject({ cabin: true, jacuzzi: true, nature: true });
  });
});
