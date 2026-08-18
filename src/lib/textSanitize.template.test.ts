import { describe, expect, it } from "vitest";
import { sanitizeLegacyTemplateLeak } from "@/lib/textSanitize";

describe("sanitizeLegacyTemplateLeak", () => {
  it("removes Barcelona/Madrid parenthetical from camping copy", () => {
    const out = sanitizeLegacyTemplateLeak(
      "Parkiraj avtodom na avtokampu izven mestnega jedra — ne v centru (Barcelona/Madrid). V mesto z metrojem.",
    );
    expect(out).not.toMatch(/barcelona|madrid/i);
    expect(out).toMatch(/ne v centru/i);
  });

  it("rewrites Uber-as-verb food hallucinations to grab", () => {
    expect(sanitizeLegacyTemplateLeak("Uber a coffee or snack near the park")).toMatch(
      /grab a coffee or snack/i,
    );
    expect(sanitizeLegacyTemplateLeak("Uber lunch near Central Park")).toMatch(
      /grab lunch near Central Park/i,
    );
    expect(sanitizeLegacyTemplateLeak("Uber a sweet treat")).toMatch(/grab a sweet treat/i);
    // Real ride copy must stay.
    expect(sanitizeLegacyTemplateLeak("Take an Uber to JFK")).toMatch(/Uber to JFK/i);
  });

  it("rewrites London Oyster Card on NYC copy to OMNY", () => {
    expect(
      sanitizeLegacyTemplateLeak(
        "Po Brooklynskem mostu uporabi Oyster Card ali brezkontaktno plačilo za metro.",
      ),
    ).toMatch(/OMNY/i);
    expect(
      sanitizeLegacyTemplateLeak(
        "Po Brooklynskem mostu uporabi Oyster Card ali brezkontaktno plačilo za metro.",
      ),
    ).not.toMatch(/Oyster/i);
  });

  it("strips leftover energy / coffee-walk template sentences", () => {
    expect(
      sanitizeLegacyTemplateLeak(
        "Peš do MoMA. Če imaš še energijo, sprehod po parku. Metro nazaj.",
      ),
    ).not.toMatch(/energijo/i);
    expect(
      sanitizeLegacyTemplateLeak("Kratek sprehod in kava pred ogledom. Potem Met."),
    ).not.toMatch(/kava pred ogledom/i);
  });

  it("strips brochure filler and rule-echo travel hacks", () => {
    expect(
      sanitizeLegacyTemplateLeak(
        "Lahkoten sprehod v okolici vaše namestitve za spoznavanje s prvim okoljem. Potem Intramuros.",
      ),
    ).not.toMatch(/lahkoten sprehod|prvim okoljem/i);
    expect(
      sanitizeLegacyTemplateLeak(
        "Uživajte v avtentični filipinski kuhinji. Raje 2 noči v Manila — 1 noč je premalo.",
      ),
    ).not.toMatch(/Uživajte v avtentični|Raje 2 noči/i);
  });

  it("scrubs false no-Uber-in-Canada hallucination", () => {
    expect(
      sanitizeLegacyTemplateLeak("Uber or transit back - no Uber in Canada"),
    ).toMatch(/Uber or transit back/i);
    expect(sanitizeLegacyTemplateLeak("Uber or transit back - no Uber in Canada")).not.toMatch(
      /no Uber in Canada/i,
    );
  });
});
