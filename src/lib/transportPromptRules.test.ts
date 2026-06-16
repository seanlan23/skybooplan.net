import { describe, expect, it } from "vitest";
import { DISTANCE_TRANSPORT_RULES } from "@/lib/transportPromptRules";

describe("DISTANCE_TRANSPORT_RULES", () => {
  it("forbids short-hop flights and mandates car for Croatia coast", () => {
    expect(DISTANCE_TRANSPORT_RULES).toContain("500 km");
    expect(DISTANCE_TRANSPORT_RULES).toContain("Under 300 km");
    expect(DISTANCE_TRANSPORT_RULES).toContain("Ljubljana");
    expect(DISTANCE_TRANSPORT_RULES).toContain("Zadar");
    expect(DISTANCE_TRANSPORT_RULES).toContain("NEVER a flight");
  });
});
