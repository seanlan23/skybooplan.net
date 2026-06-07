import { describe, expect, it } from "vitest";
import { enrichDayActivities } from "@/lib/dayEnrichers";
import { resolveTripLocale } from "@/lib/tripLocale";

describe("Philippines day enrichers", () => {
  const locale = resolveTripLocale("MNL", "Manila", "sl");

  it("uses Filipino breakfast pool on Boracay, not Vietnamese pho", () => {
    const out = enrichDayActivities(
      { morning: [], afternoon: [], evening: [] },
      "Boracay",
      2,
      locale,
      { destinationIata: "MNL", paceLabel: "intensive" },
    );
    const text = [...out.morning, ...out.afternoon, ...out.evening]
      .map((a) => `${a.name} ${a.description}`)
      .join(" ");
    expect(text).toMatch(/tapsilog|sinangag/i);
    expect(text).not.toMatch(/pho|banh mi/i);
  });

  it("rewrites Phuket Town leak on Manila evenings", () => {
    const out = enrichDayActivities(
      {
        morning: [],
        afternoon: [],
        evening: [
          {
            name: "Ulična hrana / nočni trg",
            type: "EAT",
            description:
              "Zaključi dan z ulično hrano — večerja z morskimi sadeži ali nočni trg v Phuket Town.",
          },
        ],
      },
      "Manila",
      3,
      locale,
      { destinationIata: "MNL" },
    );
    const evening = out.evening.map((a) => a.description).join(" ");
    expect(evening).not.toMatch(/phuket/i);
    expect(evening).toMatch(/binondo|roxas|morski sadeži/i);
  });
});
