import { describe, expect, it } from "vitest";
import {
  fixPoiNameForSlot,
  fixSlotTimeMismatch,
  rewriteActivityCityLeak,
  rewriteCountryFoodLeak,
  sanitizeSlText,
} from "@/lib/textSanitize";

describe("sanitizeSlText", () => {
  it("replaces Cyrillic оживи with Slovenian", () => {
    expect(sanitizeSlText("ko se tržnica оживи.")).toBe("ko se tržnica oživi.");
  });
});

describe("rewriteActivityCityLeak", () => {
  it("rewrites Phuket Town to Binondo on Manila days", () => {
    const out = rewriteActivityCityLeak(
      "Večerja z morskimi sadeži ali nočni trg v Phuket Town.",
      "Manila",
    );
    expect(out).not.toMatch(/phuket/i);
    expect(out).toMatch(/binondo/i);
  });
});

describe("rewriteCountryFoodLeak", () => {
  it("replaces Vietnamese pho on Philippines trips", () => {
    const out = rewriteCountryFoodLeak(
      "Začni z pho ali banh mi na uličnem stojalu.",
      "PH",
    );
    expect(out).toMatch(/tapsilog|sinangag/i);
    expect(out).not.toMatch(/pho|banh mi/i);
  });
});

describe("fixPoiNameForSlot", () => {
  it("strips sunset label from Wat Arun name in morning slot", () => {
    expect(fixPoiNameForSlot("Wat Arun (ob sončnem zahodu)", "morning")).toBe("Wat Arun");
  });
});

describe("fixSlotTimeMismatch", () => {
  it("aligns Wat Arun description to morning when name sunset label is stripped", () => {
    const name = fixPoiNameForSlot("Wat Arun (ob sončnem zahodu)", "morning");
    const out = fixSlotTimeMismatch(
      "Sončni zahod ob 18:00 — ne obiskuj dopoldan.",
      "morning",
      name,
    );
    expect(out).toMatch(/dopoldan/i);
    expect(out).not.toMatch(/sončni zahod ob 18:00/i);
  });
});
