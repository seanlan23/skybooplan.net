import { describe, it, expect } from "vitest";
import {
  withPlanTeaser,
  stripPlanTeaser,
  resolvePlanContentLanguage,
} from "@/lib/planTeaser";
import { translate } from "@/lib/i18n";

describe("planTeaser", () => {
  it("prepends Slovenian teaser when missing", () => {
    const teaser = translate("sl", "plan.teaser");
    const out = withPlanTeaser("Sezonsko opozorilo za Tajsko.", "sl");
    expect(out.startsWith(teaser)).toBe(true);
    expect(out).toContain("Sezonsko opozorilo");
  });

  it("does not duplicate teaser if already present", () => {
    const teaser = translate("en", "plan.teaser");
    const out = withPlanTeaser(`${teaser} Monsoon season note.`, "en");
    expect(out).toBe(`${teaser} Monsoon season note.`);
  });

  it("stripPlanTeaser removes marketing opener", () => {
    const teaser = translate("sl", "plan.teaser");
    const out = stripPlanTeaser(`${teaser} Julij prinaša bujno zeleno naravo.`, "sl");
    expect(out).toBe("Julij prinaša bujno zeleno naravo.");
    expect(out.includes("AI načrt je pripravljen")).toBe(false);
  });

  it("stripPlanTeaser removes Italian opener even when UI lang is English", () => {
    const itTeaser = translate("it", "plan.teaser");
    const out = stripPlanTeaser(
      `${itTeaser} Ottobre a Manila e nelle isole è il periodo di transizione.`,
      "en",
    );
    expect(out).toBe("Ottobre a Manila e nelle isole è il periodo di transizione.");
    expect(out).not.toMatch(/Il tuo piano AI|piano AI è pronto/i);
  });

  it("resolvePlanContentLanguage prefers stored field then teaser", () => {
    expect(
      resolvePlanContentLanguage({
        summary: "hi",
        contentLanguage: "it",
        days: [],
      }),
    ).toBe("it");
    const itTeaser = translate("it", "plan.teaser");
    expect(
      resolvePlanContentLanguage({
        summary: `${itTeaser} Ottobre a Manila.`,
        days: [],
      }),
    ).toBe("it");
  });
});
