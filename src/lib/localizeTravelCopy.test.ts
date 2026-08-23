import { describe, expect, it } from "vitest";
import { localizeTravelCopy } from "@/lib/localizeTravelCopy";
import { sanitizeForLang } from "@/lib/textSanitize";

describe("localizeTravelCopy", () => {
  it("rewrites English motorhome titles to Slovenian", () => {
    expect(localizeTravelCopy("Departure from Mežica", "sl")).toBe("Odhod iz Mežica");
    expect(localizeTravelCopy("Lunch stop en route", "sl")).toBe("Kosilo na poti");
    expect(localizeTravelCopy("Drive to Lake Garda", "sl")).toBe("Vožnja proti Lake Garda");
    expect(localizeTravelCopy("Hike to the summit of Kgale Hill", "sl")).toBe(
      "Pohod na vrh Kgale Hill",
    );
    expect(localizeTravelCopy("Chobe National Park Morning Game Drive", "sl")).toBe(
      "Jutranji ogled divjadi: Chobe National Park",
    );
  });

  it("leaves English alone when lang is en", () => {
    expect(localizeTravelCopy("Lunch stop en route", "en")).toBe("Lunch stop en route");
  });

  it("runs through sanitizeForLang for sl plans", () => {
    expect(sanitizeForLang("Departure from Mežica", "sl")).toBe("Odhod iz Mežica");
  });
});
