import { describe, expect, it } from "vitest";
import { tipKeysForDestination } from "@/lib/aiPlanTips";

describe("tipKeysForDestination", () => {
  it("keeps Thailand tips and drops Rome on Thailand trips", () => {
    const keys = tipKeysForDestination("Thailand");
    expect(keys).toContain("aiplan.tip11");
    expect(keys).not.toContain("aiplan.tip20");
    expect(keys).not.toContain("aiplan.tip16");
    expect(keys).toContain("aiplan.tip1");
  });

  it("recognizes Thailand airport codes like BKK", () => {
    const keys = tipKeysForDestination("BKK");
    expect(keys).toContain("aiplan.tip11");
    expect(keys).not.toContain("aiplan.tip20");
  });

  it("keeps Rome tip for Italy and drops Thailand wai tip", () => {
    const keys = tipKeysForDestination("Rome");
    expect(keys).toContain("aiplan.tip20");
    expect(keys).not.toContain("aiplan.tip11");
  });

  it("falls back to universal tips when destination unknown", () => {
    const keys = tipKeysForDestination("");
    expect(keys).toContain("aiplan.tip1");
    expect(keys).not.toContain("aiplan.tip20");
    expect(keys).not.toContain("aiplan.tip11");
  });
});
