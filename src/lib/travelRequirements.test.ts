import { describe, expect, it } from "vitest";
import {
  buildFallbackTravelRequirements,
  collapseResidentLabels,
  groupVisaInfoEntries,
} from "@/lib/travelRequirements";

describe("groupVisaInfoEntries", () => {
  it("merges identical visa rows into EU when all Schengen", () => {
    const grouped = groupVisaInfoEntries([
      { country: "Slovenia", requirement: "Same", howToApply: "Apply" },
      { country: "Austria", requirement: "Same", howToApply: "Apply" },
      { country: "Italy", requirement: "Same", howToApply: "Apply" },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]!.country).toBe("EU / Schengen");
  });

  it("keeps non-EU countries separate", () => {
    const grouped = groupVisaInfoEntries([
      { country: "Slovenia", requirement: "Same", howToApply: "Apply" },
      { country: "United States", requirement: "Different", howToApply: "Apply" },
    ]);
    expect(grouped).toHaveLength(2);
  });
});

describe("collapseResidentLabels", () => {
  it("collapses Central European hubs to EU", () => {
    expect(
      collapseResidentLabels(["Slovenia", "Austria", "Italy", "Croatia"]),
    ).toEqual(["EU"]);
  });

  it("keeps non-EU beside EU", () => {
    expect(collapseResidentLabels(["Germany", "United States"])).toEqual([
      "EU",
      "United States",
    ]);
  });
});

describe("buildFallbackTravelRequirements Thailand", () => {
  it("uses EU label and English 30-day rule by default", () => {
    const req = buildFallbackTravelRequirements("LJU", "BKK", "en");
    expect(req?.targetResidents).toEqual(["EU"]);
    expect(req?.visaInfo).toHaveLength(1);
    expect(req?.visaInfo[0]!.country).toBe("EU / Schengen");
    expect(req?.visaInfo[0]!.requirement).toMatch(/30 days/i);
    expect(req?.visaInfo[0]!.requirement).not.toMatch(/državljan/i);
  });

  it("keeps Slovenian copy when lang is sl", () => {
    const req = buildFallbackTravelRequirements("LJU", "BKK", "sl");
    expect(req?.visaInfo[0]!.requirement).toMatch(/30 dni/);
    expect(req?.visaInfo[0]!.requirement).not.toMatch(/60 dni brezvizumskega/);
  });
});

describe("buildFallbackTravelRequirements Spain / Schengen", () => {
  it("states free movement for EU travellers to Madrid", () => {
    const req = buildFallbackTravelRequirements("LJU", "MAD", "en");
    expect(req?.visaInfo[0]!.requirement).toMatch(/free movement|do not need a visa/i);
    expect(req?.visaInfo[0]!.requirement).not.toMatch(/Check current visa requirements/i);
    expect(req?.vaccinations).toMatch(/No special travel vaccines|routine/i);
    expect(req?.estimatedCosts).toMatch(/€0|Visa: €0/i);
  });

  it("uses Slovenian free-movement copy for Spain", () => {
    const req = buildFallbackTravelRequirements("LJU", "MAD", "sl");
    expect(req?.visaInfo[0]!.requirement).toMatch(/ne potrebujejo vize|prosti pretok/i);
  });

  it("works without origin IATA (motorhome)", () => {
    const req = buildFallbackTravelRequirements("", "MAD", "en");
    expect(req?.targetResidents).toEqual(["EU"]);
    expect(req?.visaInfo[0]!.requirement).toMatch(/visa/i);
  });
});

describe("resolveTravelRequirements replaces generic AI copy", () => {
  it("swaps boilerplate for curated Spain pack", async () => {
    const { resolveTravelRequirements } = await import("@/lib/travelRequirements");
    const resolved = resolveTravelRequirements(
      {
        targetResidents: ["EU"],
        visaInfo: [
          {
            country: "EU",
            requirement:
              "Check current visa requirements for travellers with passports from EU entering Madrid (MAD). Rules change often — always verify official sources before you go.",
            howToApply: "Use your foreign ministry site.",
          },
        ],
        vaccinations: "See a travel clinic 4–6 weeks before departure.",
        estimatedCosts: "Visa and vaccine costs vary by destination — budget about €0–150 per person.",
      },
      "LJU",
      "MAD",
      "en",
    );
    expect(resolved?.visaInfo[0]!.requirement).toMatch(/free movement|do not need a visa/i);
    expect(resolved?.visaInfo[0]!.requirement).not.toMatch(/Check current visa requirements/i);
  });
});

describe("Balkan road trip travel requirements", () => {
  it("does not mention Italy when cities are Balkan and IATA is leftover FCO", () => {
    const hint = "Balkan Zadar Split Mostar Kotor Shkoder Dubrovnik";
    const req = buildFallbackTravelRequirements("", "FCO", "en", hint);
    expect(req?.visaInfo[0]!.requirement).toMatch(/Croatia|Bosnia|Montenegro|Albania/i);
    expect(req?.visaInfo[0]!.requirement).not.toMatch(/Italy/i);
    expect(req?.visaInfo[0]!.howToApply).toMatch(/roaming|eSIM/i);
  });

  it("replaces concrete Italy visa copy on a Balkan itinerary", async () => {
    const { resolveTravelRequirements } = await import("@/lib/travelRequirements");
    const resolved = resolveTravelRequirements(
      {
        targetResidents: ["EU"],
        visaInfo: [
          {
            country: "EU / Schengen",
            requirement:
              "EU/Schengen citizens do not need a visa for Italy. Free movement applies — a valid ID card or passport is enough.",
            howToApply: "No visa application. Show ID at the border if asked.",
          },
        ],
        vaccinations: "No special travel vaccines required for EU destinations.",
        estimatedCosts: "Visa: €0. Vaccines: €0 if routines are current.",
      },
      "",
      "FCO",
      "en",
      "Balkan Zadar Split Mostar Kotor Shkoder Dubrovnik",
    );
    expect(resolved?.visaInfo[0]!.requirement).not.toMatch(/Italy/i);
    expect(resolved?.visaInfo[0]!.requirement).toMatch(/Croatia|Bosnia|Montenegro|Albania/i);
  });

  it("keeps Italy copy for a real Italy destination", async () => {
    const { resolveTravelRequirements } = await import("@/lib/travelRequirements");
    const resolved = resolveTravelRequirements(
      {
        targetResidents: ["EU"],
        visaInfo: [
          {
            country: "EU / Schengen",
            requirement:
              "EU/Schengen citizens do not need a visa for Italy. Free movement applies — a valid ID card or passport is enough.",
            howToApply: "No visa application.",
          },
        ],
        vaccinations: "No special vaccines.",
        estimatedCosts: "Visa: €0.",
      },
      "LJU",
      "FCO",
      "en",
      "Rome Italy",
    );
    expect(resolved?.visaInfo[0]!.requirement).toMatch(/Italy/i);
  });
});

describe("Thailand + Malaysia itinerary", () => {
  const klHint = "Tajska in Kuala Lumpur Phuket Ao Nang Patong";

  it("adds a Malaysia visa card next to Thailand", () => {
    const req = buildFallbackTravelRequirements("MUC", "HKT", "sl", klHint);
    expect(req?.visaInfo.length).toBeGreaterThanOrEqual(2);
    const blob = req!.visaInfo.map((v) => `${v.country} ${v.requirement} ${v.howToApply}`).join("\n");
    expect(blob).toMatch(/Tajsk|TDAC/i);
    expect(blob).toMatch(/Malezij|MDAC/i);
  });

  it("keeps Thailand AI copy and appends Malaysia when KL is in the route", async () => {
    const { resolveTravelRequirements } = await import("@/lib/travelRequirements");
    const resolved = resolveTravelRequirements(
      {
        targetResidents: ["EU"],
        visaInfo: [
          {
            country: "EU / Schengen",
            requirement:
              "Državljani EU/Schengen za turistični obisk Tajske ne potrebujejo vize vnaprej. Od maja 2026 velja 30 dni. TDAC je obvezen.",
            howToApply: "Izpolni TDAC na Thai Immigration.",
          },
        ],
        vaccinations: "Hepatitis A.",
        estimatedCosts: "Viza 0 €. TDAC brezplačen.",
      },
      "MUC",
      "HKT",
      "sl",
      klHint,
    );
    expect(resolved?.visaInfo.length).toBeGreaterThanOrEqual(2);
    const blob = resolved!.visaInfo.map((v) => `${v.country} ${v.requirement}`).join("\n");
    expect(blob).toMatch(/Tajsk|TDAC/i);
    expect(blob).toMatch(/Malezij|MDAC/i);
  });
});

describe("travel insurance (code, not Gemini)", () => {
  it("requires extra cover for EU residents leaving the EU and names SI insurers", () => {
    const req = buildFallbackTravelRequirements("LJU", "BKK", "sl", null, "SI");
    expect(req?.insurance?.required).toBe(true);
    expect(req?.insurance?.insurers).toEqual(["Coris", "Vita", "Triglav"]);
    expect(req?.insurance?.body).toMatch(/EKZZ/);
    expect(req?.insurance?.body).toMatch(/ne velja/);
    expect(req?.insurance?.body).not.toMatch(/Medicare/i);
  });

  it("still requires extra cover for EU residents inside Schengen (EHIC is not enough)", () => {
    const req = buildFallbackTravelRequirements("LJU", "MAD", "sl", null, "SI");
    expect(req?.insurance?.required).toBe(true);
    expect(req?.insurance?.insurers).toEqual(["Coris", "Vita", "Triglav"]);
    expect(req?.insurance?.body).toMatch(/znotraj EU|ni turistično zavarovanje/i);
  });

  it("uses US medical-abroad copy for US IP, not airport JFK", () => {
    const req = buildFallbackTravelRequirements("JFK", "CDG", "en", null, "US");
    expect(req?.insurance?.required).toBe(true);
    expect(req?.insurance?.insurers).toEqual(
      expect.arrayContaining(["Allianz Travel", "AIG Travel Guard", "World Nomads"]),
    );
    expect(req?.insurance?.insurers).not.toContain("Coris");
    expect(req?.insurance?.body).toMatch(/Medicare/i);
    expect(req?.insurance?.body).not.toMatch(/EHIC/);
  });

  it("recommends ADAC for German IP, even when flying LJU", () => {
    const req = buildFallbackTravelRequirements("LJU", "BKK", "en", null, "DE");
    expect(req?.insurance?.insurers).toEqual(
      expect.arrayContaining(["ADAC", "HanseMerkur", "ERV"]),
    );
    expect(req?.insurance?.body).toMatch(/EHIC|Reiseversicherung/i);
  });

  it("uses Slovenian insurers for SI IP even from MUC, ignoring UI language", () => {
    const req = buildFallbackTravelRequirements("MUC", "BKK", "de", null, "SI");
    expect(req?.insurance?.insurers).toEqual(["Coris", "Vita", "Triglav"]);
    expect(req?.insurance?.body).toMatch(/EKZZ|EHIC|Reiseversicherung/i);
    expect(req?.insurance?.insurers).not.toContain("ADAC");
  });

  it("does not pick ADAC from Munich airport or German UI when IP is missing", () => {
    const req = buildFallbackTravelRequirements("MUC", "BKK", "de");
    expect(req?.insurance?.insurers).toEqual(["Coris", "Vita", "Triglav"]);
    expect(req?.insurance?.insurers).not.toContain("ADAC");
  });

  it("mentions GHIC for UK IP, not LHR airport", () => {
    const req = buildFallbackTravelRequirements("LHR", "BKK", "en", null, "GB");
    expect(req?.insurance?.insurers).toEqual(expect.arrayContaining(["Aviva", "AXA", "Staysure"]));
    expect(req?.insurance?.body).toMatch(/GHIC/);
  });

  it("injects insurance even when AI visa copy is kept", async () => {
    const { resolveTravelRequirements } = await import("@/lib/travelRequirements");
    const resolved = resolveTravelRequirements(
      {
        targetResidents: ["EU"],
        visaInfo: [
          {
            country: "EU / Schengen",
            requirement:
              "EU/Schengen citizens do not need a visa in advance for tourism in Thailand. From May 2026, visa-free stays are 30 days per entry. Passport must be valid at least 6 months. Complete TDAC before arrival.",
            howToApply: "Thai Immigration TDAC portal before you fly.",
          },
        ],
        vaccinations: "Hepatitis A recommended for Thailand; update routine vaccines.",
        estimatedCosts: "Tourist visa usually €0. TDAC is free. Hepatitis A vaccine about €40–80.",
      },
      "MUC",
      "BKK",
      "de",
      null,
      "SI",
    );
    expect(resolved?.insurance?.insurers).toEqual(["Coris", "Vita", "Triglav"]);
    expect(resolved?.insurance?.required).toBe(true);
  });
});
