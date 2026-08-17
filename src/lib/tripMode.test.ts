import { describe, expect, it } from "vitest";
import {
  detectAccommodationMode,
  detectHotelRestInterval,
  isHotelRestDay,
  motorhomeTransportBetween,
  resolveTripAccommodation,
} from "@/lib/tripMode";
import { fixSlotTimeMismatch } from "@/lib/textSanitize";

describe("detectAccommodationMode", () => {
  it("detects avtodom in Slovenian wishes", () => {
    expect(
      detectAccommodationMode(
        "Naredi mi plan za španijo do gibraltarja. Najeli bi avtodom",
      ),
    ).toBe("motorhome");
  });

  it("defaults to hotel", () => {
    expect(detectAccommodationMode("Barcelona in Madrid")).toBe("hotel");
  });

  it("does not treat car prompts that forbid motorhome as RV trips", () => {
    expect(
      detectAccommodationMode(
        "Car road trip — not by plane, not by motorhome. Overnights = hotels. FORBIDDEN: camps.",
      ),
    ).toBe("hotel");
    expect(
      detectAccommodationMode(
        "Potovanje z AVTOM (road trip) — ne z letalom, ne z avtodomom.",
      ),
    ).toBe("hotel");
  });
});

describe("motorhomeTransportBetween", () => {
  it("returns drive not flight", () => {
    const t = motorhomeTransportBetween(506, "Gibraltar", "Madrid");
    expect(t.type).toBe("drive");
    expect(t.howTo).toMatch(/avtodomom/i);
    expect(t.howTo).not.toMatch(/let/i);
  });

  it("returns English howTo when slo=false", () => {
    const t = motorhomeTransportBetween(506, "Gibraltar", "Madrid", false);
    expect(t.howTo).toMatch(/motorhome/i);
    expect(t.howTo).not.toMatch(/avtodom/i);
  });
});

describe("detectHotelRestInterval", () => {
  it("parses vsak 5 dan hotel from Slovenian wishes", () => {
    expect(
      detectHotelRestInterval(
        "želiva iti po route 66. Najela bova majhen avtodom! Vsak 5 dan bova prespala v hotelu!",
      ),
    ).toBe(5);
  });

  it("parses hotel na 3 dni from Slovenian wishes", () => {
    expect(
      detectHotelRestInterval(
        "Želim route 66. Najela bova avtodom. Želiva hotel na 3 dni da se alo Odpočijeva",
      ),
    ).toBe(3);
  });

  it("resolveTripAccommodation recovers interval from wishes when skeleton field missing", () => {
    const wishes =
      "Route 66 z avtodomom. Vsak 4 dan hotel da se spočijeva.";
    const resolved = resolveTripAccommodation({ wishes });
    expect(resolved.accommodationMode).toBe("motorhome");
    expect(resolved.hotelRestEveryNDays).toBe(4);
    expect(isHotelRestDay(4, resolved.hotelRestEveryNDays!)).toBe(true);
    expect(isHotelRestDay(3, resolved.hotelRestEveryNDays!)).toBe(false);
  });

  it("marks hotel rest days", () => {
    expect(isHotelRestDay(5, 5)).toBe(true);
    expect(isHotelRestDay(4, 5)).toBe(false);
    expect(isHotelRestDay(3, 3)).toBe(true);
    expect(isHotelRestDay(6, 3)).toBe(true);
    expect(isHotelRestDay(21, 3)).toBe(true);
    expect(isHotelRestDay(21, 3, { totalDays: 21 })).toBe(false);
    expect(isHotelRestDay(18, 3, { totalDays: 21 })).toBe(true);
  });
});

describe("fixSlotTimeMismatch", () => {
  it("rewrites morning tips in evening slot", () => {
    const out = fixSlotTimeMismatch("Gran Via. Najbolje obiskati zjutraj.", "evening");
    expect(out).not.toMatch(/zjutraj/i);
    expect(out).toMatch(/zvečer/i);
  });

  it("rewrites afternoon tips placed in morning slot", () => {
    const out = fixSlotTimeMismatch("Najboljši čas za obisk je popoldne.", "morning");
    expect(out).toMatch(/dopoldan/i);
  });
});
