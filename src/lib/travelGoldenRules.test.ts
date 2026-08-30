import { describe, expect, it } from "vitest";
import { buildGoldenRules, formatGoldenRulesPdfLines } from "@/lib/travelGoldenRules";

describe("buildGoldenRules", () => {
  it("uses the Slovenian carefree-travel copy", () => {
    const rules = buildGoldenRules("sl");
    expect(rules.title).toBe("Zlata pravila brezskrbnega potovanja");
    const blob = formatGoldenRulesPdfLines(rules).join("\n");
    expect(blob).toMatch(/Ročna prtljaga za prvi dan/);
    expect(blob).toMatch(/kopalke/);
    expect(blob).toMatch(/Google Maps/);
    expect(blob).toMatch(/Without Conversion/);
    expect(blob).toMatch(/WhatsApp/);
  });

  it("localizes the English title", () => {
    expect(buildGoldenRules("en").title).toBe("Golden rules for a carefree trip");
  });
});
