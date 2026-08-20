import { describe, expect, it } from "vitest";
import {
  formatPlansGeneratedLabel,
  resolvePublicPlanCount,
} from "@/lib/planStats";

describe("formatPlansGeneratedLabel", () => {
  it("inserts the count into the template", () => {
    const en = formatPlansGeneratedLabel(1247, "{n} plans generated", "en");
    expect(en).toMatch(/1247|1,247/);
    expect(en).toContain("plans generated");
    expect(formatPlansGeneratedLabel(12, "{n} načrtov ustvarjenih", "sl")).toBe(
      "12 načrtov ustvarjenih",
    );
  });

  it("uses Slovenian grammar for 1–4", () => {
    expect(formatPlansGeneratedLabel(1, "{n} načrtov ustvarjenih", "sl")).toBe(
      "1 načrt ustvarjen",
    );
    expect(formatPlansGeneratedLabel(2, "{n} načrtov ustvarjenih", "sl")).toBe(
      "2 načrta ustvarjena",
    );
    expect(formatPlansGeneratedLabel(3, "{n} načrtov ustvarjenih", "sl")).toBe(
      "3 načrti ustvarjeni",
    );
    expect(formatPlansGeneratedLabel(4, "{n} načrtov ustvarjenih", "sl")).toBe(
      "4 načrti ustvarjeni",
    );
  });

  it("uses English singular for one plan", () => {
    expect(formatPlansGeneratedLabel(1, "{n} travel plans generated", "en")).toBe(
      "1 travel plan generated",
    );
  });

  it("never reports below the known generated floor", () => {
    expect(resolvePublicPlanCount(1, 0)).toBe(358);
    expect(resolvePublicPlanCount(12, 200)).toBe(358);
    expect(resolvePublicPlanCount(12, 300)).toBe(358);
    expect(resolvePublicPlanCount(400, 12)).toBe(400);
    expect(resolvePublicPlanCount(358, 10)).toBe(358);
  });
});
