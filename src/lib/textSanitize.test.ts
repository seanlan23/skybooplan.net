import { describe, expect, it } from "vitest";
import {
  fixHotelCopyErrors,
  fixMotorhomeCopyErrors,
  fixPoiNameForSlot,
  fixSlotTimeMismatch,
  completeTruncatedHeadline,
  completeTruncatedPlaceName,
  repairTruncatedCopy,
  stripTruncatedCopyFromPlan,
  rewriteActivityCityLeak,
  rewriteCountryFoodLeak,
  sanitizeForLang,
  sanitizeLegacyTemplateLeak,
  sanitizeSlText,
  scrubInappropriatePoiCopy,
} from "@/lib/textSanitize";

describe("sanitizeSlText", () => {
  it("replaces Cyrillic оживи with Slovenian", () => {
    expect(sanitizeSlText("ko se tržnica оживи.")).toBe("ko se tržnica oživi.");
  });

  it("preserves activity bullet newlines", () => {
    const input = "- Prva točka\n- Druga točka\n- Tretja točka";
    expect(sanitizeSlText(input)).toBe(input);
  });
});

describe("sanitizeLegacyTemplateLeak", () => {
  it("strips raw Google Maps dir URLs so tips are not %20 garbage", () => {
    const raw =
      "Google Maps celotna pot: https://www.google.com/maps/dir/Your%20hotel%2C%20Bangkok/Mae%20Klong — Začetek in konec sta označena kot „Your hotel“.";
    expect(sanitizeLegacyTemplateLeak(raw)).not.toMatch(/maps\/dir|Your%20hotel|%20hotel/i);
    expect(sanitizeLegacyTemplateLeak(raw)).toMatch(/Google Maps celotna pot/i);
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

describe("repairTruncatedCopy", () => {
  it("closes unclosed ferry-terminal cuts and drops sentence stubs", () => {
    expect(
      repairTruncatedCopy(
        "Zjutraj se odpravite do enega izmed trajektnih terminalov (Puerto Juarez ali Embar",
      ),
    ).toMatch(/terminalov\.$/);
    expect(
      repairTruncatedCopy(
        "Dopoldne preživite v Gran Cenote, eni najbolj znanih cenot na Yucatánu. Cen",
      ),
    ).toMatch(/Yucatánu\.$/);
    expect(
      repairTruncatedCopy("Uživajte na glavni plaži otoka, Playa Holbox. Kopajte"),
    ).toMatch(/Holbox\.$/);
    expect(
      repairTruncatedCopy(
        "izlet vključuje Isla Pajaros (Otok ptic), Isla Pasión (Otok.",
      ),
    ).toMatch(/Pajaros \(Otok ptic\)\.$|Pajaros \(Otok ptic\), Isla Pasión\.$/);
    expect(
      repairTruncatedCopy(
        "obiščite kakšno trgovino in si privoščite.",
      ),
    ).not.toMatch(/privoščite/);
    expect(
      repairTruncatedCopy("Vzdušje je sproščeno in prijetno, primerno."),
    ).toMatch(/prijetno\.$/);
    expect(
      repairTruncatedCopy("Za večerjo obiščite El Camello Jr.\n, kjer boste uživali v svežih morskih sadežih."),
    ).toMatch(/morskih sadežih/);
    expect(repairTruncatedCopy("Sprehodite se po mestu Tulum.")).toBe(
      "Sprehodite se po mestu Tulum.",
    );
    expect(
      repairTruncatedCopy(
        "Odpravite se na Isla Mujeres s trajektom iz Puerto Juareza. Vožnja traja",
      ),
    ).toMatch(/Juareza\.$/);
    expect(repairTruncatedCopy("Preizkusite")).toBe("");
    expect(
      repairTruncatedCopy(
        "Uživajte v elegantni večerji v Metis Restaurant & Gallery, ki ponuja prefinjeno francosko-mediteransko kuhinjo v čudovitem.",
      ),
    ).toMatch(/kuhinjo\.$/);
    expect(
      repairTruncatedCopy("Uživajte v skupni večerji, ki jo pripravijo va"),
    ).toMatch(/večerji/);
    expect(
      repairTruncatedCopy("Uživajte v skupni večerji, ki jo pripravijo va"),
    ).not.toMatch(/\bva\s*$/);
    expect(repairTruncatedCopy("Po zajtrku v vasi in zadnjem raz")).toMatch(
      /vasi\.$/,
    );
    expect(
      completeTruncatedPlaceName("Povratek iz Wae Reba v Labuan.", "Labuan Bajo"),
    ).toBe("Povratek iz Wae Reba v Labuan Bajo.");
    expect(repairTruncatedCopy("Obiščite starodavno.")).toBe("");
    expect(repairTruncatedCopy("Obisk trž")).toBe("");
    expect(repairTruncatedCopy("Tečaj tajske kuhinje (")).toBe("Tečaj tajske kuhinje");
    expect(repairTruncatedCopy("Odp")).toBe("");
    expect(
      repairTruncatedCopy(
        "Odpravite se na izlet z ladjo, ki vas popelje do bližnjih otokov, mangrov in Punta Cocos, kjer lahko opazujete ptice in se kopate v.",
      ),
    ).toMatch(/Punta Cocos\.$/);
    expect(
      repairTruncatedCopy(
        "Odpravite se na izlet z ladjo, ki vas popelje do bližnjih otokov, mangrov in Punta Cocos, kjer lahko opazujete ptice in se kopate v.",
      ),
    ).not.toMatch(/kopate/);
    expect(completeTruncatedHeadline("Odhod iz Mexico City / mednarodni.")).toBe(
      "Odhod iz Mexico City / mednarodni let",
    );
    expect(completeTruncatedHeadline("Odhod iz Mexico City / mednarodni..")).toBe(
      "Odhod iz Mexico City / mednarodni let",
    );
  });

  it("drops a two-letter day stub and completes a cut city title", () => {
    const plan = {
      days: [
        {
          day: 4,
          city: "Ubud",
          title: "Riževe terase",
          morning: "Ri",
          activities: {
            morning: [{ name: "Ri", description: "Ri" }],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 12,
          city: "Labuan Bajo",
          title: "Povratek iz Wae Reba v Labuan.",
          morning: "Po zajtrku v vasi in zadnjem raz",
        },
      ],
    };
    expect(stripTruncatedCopyFromPlan(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.morning).toBe("");
    expect(plan.days[0]!.activities!.morning).toEqual([]);
    expect(plan.days[1]!.title).toMatch(/Labuan Bajo/);
    expect(plan.days[1]!.morning).toMatch(/vasi\.$/);
  });

  it("finishes a cut departure title and drops stub activity copy", () => {
    const plan = {
      days: [
        {
          day: 14,
          city: "Mexico City",
          title: "Odhod iz Mexico City / mednarodni.",
          activities: {
            morning: [
              { name: "Celodnevni izlet v Teotihuacán", description: "Obiščite starodavno." },
              { name: "Celodnevni izlet v zabaviščni park Xcaret", description: "Odp" },
            ],
            afternoon: [],
            evening: [],
          },
        },
      ],
    };
    expect(stripTruncatedCopyFromPlan(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.title).toBe("Odhod iz Mexico City / mednarodni let");
    expect(plan.days[0]!.activities!.morning[0]!.description).toBe("");
    expect(plan.days[0]!.activities!.morning[1]!.description).toBe("");
    expect(plan.days[0]!.activities!.morning[0]!.name).toMatch(/Teotihuacán/);
  });

  it("drops a cut market stub and closes an unclosed cooking-class name", () => {
    const plan = {
      days: [
        {
          day: 8,
          city: "Chiang Mai",
          title: "Chiang Mai",
          activities: {
            morning: [{ name: "Obisk trž", description: "Obisk trž" }],
            afternoon: [],
            evening: [
              { name: "Tečaj tajske kuhinje (", description: "Večerni tečaj." },
            ],
          },
        },
      ],
    };
    expect(stripTruncatedCopyFromPlan(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.activities!.morning).toEqual([]);
    expect(plan.days[0]!.activities!.evening[0]!.name).toBe("Tečaj tajske kuhinje");
  });
});
