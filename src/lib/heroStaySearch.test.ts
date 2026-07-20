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
        passengers: "2 odrasli",
        pace: "",
        budget: "",
      },
      "sl",
    );
    expect(stay.city).toBe("Thailand");
    expect(stay.checkIn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stay.checkOut > stay.checkIn).toBe(true);
    expect(stay.adults).toBe(2);
    expect(stay.rooms).toBeGreaterThanOrEqual(1);
  });
});
