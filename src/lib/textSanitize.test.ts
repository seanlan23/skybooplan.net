import { describe, expect, it } from "vitest";
import {
  fixHotelCopyErrors,
  fixMotorhomeCopyErrors,
  fixPoiNameForSlot,
  fixSlotTimeMismatch,
  rewriteActivityCityLeak,
  rewriteCountryFoodLeak,
  sanitizeForLang,
  sanitizeSlText,
  scrubInappropriatePoiCopy,
} from "@/lib/textSanitize";

describe("sanitizeSlText", () => {
  it("replaces Cyrillic оживи with Slovenian", () => {
    expect(sanitizeSlText("ko se tržnica оживи.")).toBe("ko se tržnica oživi.");
  });
});

describe("fixMotorhomeCopyErrors", () => {
  it("rewrites Titova jama to Tiberijeva jama", () => {
    expect(fixMotorhomeCopyErrors("Obisk Sperlonge in Titove jame", "Sperlonga")).toMatch(
      /Tiberijeva jama|Villa di Tiberio/i,
    );
    expect(fixMotorhomeCopyErrors("Obisk Sperlonge in Titove jame")).not.toMatch(/Titov/i);
  });

  it("replaces San Francesco camp only near San Daniele", () => {
    const out = fixMotorhomeCopyErrors(
      "Nastanitev v Kamp Centro Vacanze San Francesco",
      "San Daniele del Friuli",
    );
    expect(out).toMatch(/Area sosta camper San Daniele/i);
    expect(out).not.toMatch(/San Francesco/i);
  });

  it("rewrites hotel surroundings to camp on RV copy", () => {
    expect(
      fixMotorhomeCopyErrors(
        "Po počitku razišči okolico hotela peš ali z lokalnim prevozom.",
      ),
    ).toMatch(/okolico kampa/i);
    expect(fixMotorhomeCopyErrors("Dinner near the hotel")).toMatch(/campsite/i);
  });
});

describe("hotel lodging sanitize", () => {
  it("does not rewrite hotel → campsite in sanitizeForLang", () => {
    expect(sanitizeForLang("Leave the hotel about 3 hours early.", "en")).toMatch(
      /hotel/i,
    );
    expect(sanitizeForLang("Leave the hotel about 3 hours early.", "en")).not.toMatch(
      /campsite/i,
    );
  });

  it("fixHotelCopyErrors undoes campsite wording on hotel trips", () => {
    expect(fixHotelCopyErrors("Pick up luggage at the campsite")).toMatch(/hotel/i);
    expect(fixHotelCopyErrors("Pick up luggage at the campsite")).not.toMatch(/campsite/i);
  });
});

describe("scrubInappropriatePoiCopy", () => {
  it("rewrites penis temple / fertility shrine wording for Phra Nang", () => {
    const out = scrubInappropriatePoiCopy(
      "Visit the penis temple fertility shrine with phallic offerings at Phra Nang.",
    );
    expect(out).not.toMatch(/penis|phallic|fertility shrine/i);
    expect(out).toMatch(/Phra Nang|seaside shrine|shrine offerings/i);
  });

  it("runs via sanitizeForLang", () => {
    const out = sanitizeForLang("Famous penis temple near Railay.", "sl", "TH");
    expect(out).not.toMatch(/penis temple/i);
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
