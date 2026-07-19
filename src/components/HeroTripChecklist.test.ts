import { describe, expect, it } from "vitest";
import {
  parseMakeSearchDestination,
  parseMakeSearchOriginAirports,
} from "@/lib/makeSearch";

/** Mirror checklist + hero origin rules used in UI. */
function checklistFromLabel(destination?: string, origin?: string): string | undefined {
  const destCode = parseMakeSearchDestination(destination ?? "")?.toUpperCase();
  const originCodes = origin
    ? parseMakeSearchOriginAirports(origin).filter(
        (code) => !destCode || code !== destCode,
      )
    : [];
  const rawOrigin = origin?.trim() || "";
  if (originCodes.length > 0) return rawOrigin;
  if (rawOrigin && destCode && !rawOrigin.toUpperCase().includes(destCode)) {
    return rawOrigin;
  }
  return undefined;
}

function originsFromCollected(destination?: string, origin?: string): string[] {
  const destCode = parseMakeSearchDestination(destination ?? "")?.toUpperCase() ?? null;
  return parseMakeSearchOriginAirports(
    [destination?.trim(), origin?.trim()].filter(Boolean).join(" "),
  ).filter((code) => !destCode || code !== destCode);
}

describe("hero origin vs destination", () => {
  it("does not treat Phuket (HKT) as departure airport", () => {
    expect(originsFromCollected("Phuket (HKT)", "")).toEqual([]);
    expect(checklistFromLabel("Phuket (HKT)", undefined)).toBeUndefined();
    expect(checklistFromLabel("Phuket (HKT)", "HKT")).toBeUndefined();
  });

  it("keeps real origin Munich with Phuket destination", () => {
    expect(originsFromCollected("Phuket (HKT)", "Munich (MUC)")).toEqual(["MUC"]);
    expect(checklistFromLabel("Phuket (HKT)", "Munich (MUC)")).toBe("Munich (MUC)");
  });
});
