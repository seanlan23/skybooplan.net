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
});
