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
});
