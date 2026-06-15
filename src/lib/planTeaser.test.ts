import { describe, it, expect } from "vitest";
import { withPlanTeaser, stripPlanTeaser } from "@/lib/planTeaser";
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
});
