import { describe, expect, it } from "vitest";
import {
  fixHotelCopyErrors,
  fixMotorhomeCopyErrors,
  fixPoiNameForSlot,
  fixSlotTimeMismatch,
  clipAtWordBoundary,
  completeTruncatedHeadline,
  completeTruncatedPlaceName,
  expandHeadlineFromContext,
  isPlaceholderOrTruncatedCopy,
  activityHasRenderableBody,
  isDaypartSlotLabel,
  sanitizeActivityTitle,
  repairTruncatedCopy,
  looksLikeCutStemSentence,
  stripTruncatedCopyFromPlan,
  rewriteActivityCityLeak,
  rewriteCountryFoodLeak,
  sanitizeForLang,
  sanitizeLegacyTemplateLeak,
  sanitizePlanGuestCopy,
  sanitizeSlText,
  scrubInappropriatePoiCopy,
  stripMarkdownTablePipes,
  stripPlannerMetaCopy,
} from "@/lib/textSanitize";

describe("stripMarkdownTablePipes", () => {
  it("drops raw markdown table pipes from titles and clocks", () => {
    expect(stripMarkdownTablePipes("| High Line | 10:00 |")).toBe("High Line 10:00");
    expect(stripMarkdownTablePipes("| 10:00 |")).toBe("10:00");
    expect(stripMarkdownTablePipes("| High Line | 10:00 |")).not.toMatch(/\|/);
  });
});

describe("sanitizeForLang", () => {
  it("strips markdown table pipes in every language", () => {
    expect(sanitizeForLang("| High Line | 10:00 |", "en")).toBe("High Line 10:00");
    expect(sanitizeForLang("| High Line | 10:00 |", "de")).not.toMatch(/\|/);
  });
});

describe("sanitizeSlText", () => {
  it("replaces Cyrillic оживи with Slovenian", () => {
    expect(sanitizeSlText("ko se tržnica оживи.")).toBe("ko se tržnica oživi.");
  });

  it("preserves activity bullet newlines", () => {
    const input = "- Prva točka\n- Druga točka\n- Tretja točka";
    expect(sanitizeSlText(input)).toBe(input);
  });

  it("fixes dual, seafood, assistance, and LaTeX dates", () => {
    expect(sanitizeSlText("Za 2 potnikov jedi morske sadeve. 24h asistença. $9/11$")).toBe(
      "Za 2 potnika jedi morske sadeže. 24h asistenca. 9/11",
    );
  });
});

describe("sanitizePlanGuestCopy", () => {
  it("rewrites Slovenian dual, seafood, and LaTeX dates on the mapped plan", () => {
    const plan = {
      summary: "Za 2 potnikov",
      days: [
        {
          title: "Ogled $9/11$",
          localTips: "Jedi morske sadeve. 24h asistença.",
          activities: {
            morning: [{ name: "Memorial", description: "Spomin na $9/11$." }],
            afternoon: [],
            evening: [],
          },
        },
      ],
    };
    sanitizePlanGuestCopy(plan, "sl");
    expect(plan.summary).toBe("Za 2 potnika");
    expect(plan.days[0]!.title).toBe("Ogled 9/11");
    expect(plan.days[0]!.localTips).toMatch(/morske sadeže/);
    expect(plan.days[0]!.localTips).toMatch(/asistenca/);
    expect(plan.days[0]!.localTips).not.toMatch(/asistença/);
    expect(plan.days[0]!.activities!.morning![0]!.description).toBe("Spomin na 9/11.");
  });
});

describe("stripPlannerMetaCopy", () => {
  it("removes leaked day-trip bans from activity text", () => {
    expect(
      stripPlannerMetaCopy(
        "Ao Nang: lokalne plaže. Ne enodnevni izlet na Koh Phi Phi — tam že imaš večdnevno bivanje.",
      ),
    ).toBe("Ao Nang: lokalne plaže.");
    expect(
      stripPlannerMetaCopy("Local sights. Not a day trip to Koh Phi Phi — you already stay there overnight."),
    ).toBe("Local sights.");
    expect(stripPlannerMetaCopy("PREPOVEDANO: izlet na otok. Tempelj Wat")).toMatch(/Tempelj Wat/i);
    expect(stripPlannerMetaCopy("Dopoldanski izlet na Ayutthaya z vlakom.")).toBe(
      "Dopoldanski izlet na Ayutthaya z vlakom.",
    );
    expect(
      stripPlannerMetaCopy(
        "Večerna odjava. Prtljago vzemi s seboj — na letališče že zvečer. Na letališču si že od prejšnjega večera — brez ponovnega transferja zjutraj.",
      ),
    ).toBe("Večerna odjava.");
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
        "Obiščite znameniti 5. avenijo v Playa del Carmen in se sprehodite do plaže.",
      ),
    ).toContain("znameniti 5. avenijo");
    expect(looksLikeCutStemSentence("znameniti 5.")).toBe(true);
    expect(looksLikeCutStemSentence("kolonialnega.")).toBe(true);
    expect(looksLikeCutStemSentence("najstarejšo.")).toBe(true);
    expect(looksLikeCutStemSentence("Kulinarične in kulturne.")).toBe(true);
    expect(looksLikeCutStemSentence("Sprehod po Canal Walk in ogled centra.")).toBe(false);
    expect(repairTruncatedCopy("Obiščite znameniti 5.")).not.toMatch(/znameniti 5\./);
    expect(repairTruncatedCopy("Oglejte si srce kolonialnega.")).not.toMatch(/kolonialnega\./);
    expect(repairTruncatedCopy("Obiščite najstarejšo.")).not.toMatch(/najstarejšo\./);
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
    expect(
      completeTruncatedPlaceName("Celodnevna otoška tura okoli Koh Phi.", "Koh Phi Phi Don"),
    ).toBe("Celodnevna otoška tura okoli Koh Phi Phi Don.");
    expect(repairTruncatedCopy("Wat Plai Laem in Hin Ta Hin.")).toBe("Wat Plai Laem.");
    expect(
      repairTruncatedCopy(
        "Hin Ta Hin Yai so nenavadne skalne formacije, ki spominjajo na moške in ženske genitalije in so.",
      ),
    ).toMatch(/formacije|Yai/i);
    expect(
      repairTruncatedCopy(
        "Hin Ta Hin Yai so nenavadne skalne formacije, ki spominjajo na moške in ženske genitalije in so.",
      ),
    ).not.toMatch(/in so\.\s*$/);
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
    expect(
      completeTruncatedHeadline("Razgledna točka Top of.", "Rockefeller Center"),
    ).toBe("Razgledna točka Top of the Rock");
    expect(
      completeTruncatedHeadline("Hollywood Boulevard in Walk of.", "Hollywood"),
    ).toBe("Hollywood Boulevard in Walk of Fame");
    expect(
      completeTruncatedHeadline("Sprehod ob Canal.", "Canal Walk, Indianapolis"),
    ).toBe("Sprehod ob Canal Walk");
    expect(
      completeTruncatedHeadline(
        "Narodnemu parku.",
        "Zjutraj se boste odpeljali proti Narodnemu parku Krka, ki je znan po slapovih.",
      ),
    ).toBe("Narodnemu parku Krka");
    expect(
      completeTruncatedHeadline("Zlatni.", "Kopanje pri plaži Zlatni Rat na Braču."),
    ).toBe("Zlatni Rat");
    expect(
      completeTruncatedHeadline(
        "Dioklecijanove",
        "Ogled Dioklecijanove palače in starega mestnega jedra.",
      ),
    ).toBe("Dioklecijanove palače");
    expect(
      completeTruncatedHeadline("otok.", "Trajekt na otok Brač in dnevni izlet."),
    ).toBe("otok Brač");
    expect(clipAtWordBoundary("Narodnemu parku Krka in slapovi Skradinski buk", 22)).toBe(
      "Narodnemu parku Krka",
    );
    expect(clipAtWordBoundary("Dioklecijanove", 8)).toBe("Dioklecijanove");
    expect(expandHeadlineFromContext("Zlatni.", "no matching body")).toBe("Zlatni.");
    expect(
      completeTruncatedPlaceName("Indianapolis → St.", "St. Louis"),
    ).toBe("Indianapolis → St. Louis.");
    expect(repairTruncatedCopy("Vožnja proti.")).toBe("Vožnja.");
    expect(repairTruncatedCopy("Po vrnitvi v let")).toBe("");
    expect(repairTruncatedCopy("Sprehod po starem mestnem jedru in ogled palače...")).not.toMatch(
      /\.\.\.|…/,
    );
    expect(repairTruncatedCopy("Sprehod po starem mestnem jedru in ogled palače...")).toMatch(
      /jedru|palače\.$/,
    );
    expect(
      repairTruncatedCopy("Po kosilu se sprehodite do tržnice in poskusite lokaln"),
    ).not.toMatch(/lokaln\s*$/);
    expect(repairTruncatedCopy("Večerja v restavraciji in prefinjenem ambient")).toBe(
      "Večerja v restavraciji.",
    );
    expect(repairTruncatedCopy("International return flight")).toBe(
      "International return flight",
    );
    expect(repairTruncatedCopy("Odhod 14:00.")).toMatch(/Odhod 14:00/);
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

  it("completes cut day titles from the day's copy instead of leaving a stem", () => {
    const plan = {
      days: [
        {
          day: 3,
          city: "Šibenik",
          title: "Narodnemu parku.",
          morning:
            "Zjutraj se boste odpeljali proti Narodnemu parku Krka, ki je znan po slapovih.",
        },
      ],
    };
    expect(stripTruncatedCopyFromPlan(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.title).toBe("Narodnemu parku Krka");
  });

  it("replaces a cut day title with the city name", () => {
    const plan = {
      days: [
        {
          day: 7,
          city: "Chiang Mai",
          title: "Kulinarične in kulturne.",
        },
      ],
    };
    expect(stripTruncatedCopyFromPlan(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.title).toBe("Chiang Mai");
  });

  it("drops placeholder titles and leftover ellipsis copy", () => {
    expect(isPlaceholderOrTruncatedCopy("TODO")).toBe(true);
    expect(isPlaceholderOrTruncatedCopy("[PLACEHOLDER]")).toBe(true);
    expect(isPlaceholderOrTruncatedCopy("Visit the museum...")).toBe(true);
    expect(isPlaceholderOrTruncatedCopy("Sprehod po Canal Walk in ogled centra.")).toBe(
      false,
    );
    expect(activityHasRenderableBody({ description: "" })).toBe(false);
    expect(activityHasRenderableBody({ description: "TODO" })).toBe(false);
    expect(
      activityHasRenderableBody({
        description: "Sprehod po Canal Walk in ogled centra zvečer.",
      }),
    ).toBe(true);
    expect(activityHasRenderableBody({ bullets: ["Ena konkretna točka."] })).toBe(true);
    expect(isDaypartSlotLabel("Večer")).toBe(true);
    expect(isDaypartSlotLabel("Večer: Večer")).toBe(true);
    expect(isDaypartSlotLabel("Evening: Evening")).toBe(true);
    expect(isDaypartSlotLabel("Večerja v Maraisu")).toBe(false);
    expect(sanitizeActivityTitle("Večer", "Večer")).toBe("");
    expect(sanitizeActivityTitle("Evening: Evening", "Evening")).toBe("");
    expect(
      sanitizeActivityTitle(
        "Wat Pho",
        "Reclining Buddha hall and a local tip about the massage school next door.",
      ),
    ).toBe("Wat Pho");
    expect(activityHasRenderableBody({ description: "Večer" })).toBe(false);
    expect(activityHasRenderableBody({ description: "Večer: Večer" })).toBe(false);
    expect(activityHasRenderableBody({ bullets: ["Večer"] })).toBe(false);

    const plan = {
      days: [
        {
          day: 2,
          city: "Paris",
          title: "Louvre",
          activities: {
            morning: [
              { name: "TODO", description: "Coming soon..." },
              {
                name: "Louvre",
                description:
                  "Začni pri Denon krilu. Vstopnico kupi online dan prej in vstani v vrsti za vrhunska dela, ne za vsako sobo.",
              },
            ],
            afternoon: [{ name: "Visit the gardens...", description: "TBD" }],
            evening: [],
          },
        },
      ],
    };
    expect(stripTruncatedCopyFromPlan(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.activities!.morning.map((a) => a.name)).toEqual(["Louvre"]);
    expect(plan.days[0]!.activities!.afternoon).toEqual([]);
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

  it("completes cut USA landmark titles from nearby copy", () => {
    const plan = {
      days: [
        {
          day: 3,
          city: "New York",
          title: "Manhattan",
          activities: {
            morning: [
              {
                name: "Top of.",
                description: "Ogled z Rockefeller Center, Top of the Rock.",
              },
            ],
            afternoon: [],
            evening: [],
          },
        },
        {
          day: 8,
          city: "St. Louis",
          title: "Indianapolis → St.",
        },
      ],
    };
    expect(stripTruncatedCopyFromPlan(plan)).toBeGreaterThan(0);
    expect(plan.days[0]!.activities!.morning[0]!.name).toBe("Top of the Rock");
    expect(plan.days[1]!.title).toBe("Indianapolis → St. Louis.");
  });
});
