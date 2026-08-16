import { describe, expect, it } from "vitest";
import { formatPlansGeneratedLabel } from "@/lib/planStats";

describe("formatPlansGeneratedLabel", () => {
  it("inserts the count into the template", () => {
    const en = formatPlansGeneratedLabel(1247, "{n} plans generated", "en");
    expect(en).toMatch(/1247|1,247/);
    expect(en).toContain("plans generated");
    expect(formatPlansGeneratedLabel(12, "{n} načrtov ustvarjenih", "sl")).toBe(
      "12 načrtov ustvarjenih",
    );
  });
});
