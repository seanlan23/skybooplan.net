import { describe, expect, it } from "vitest";
import { enrichDayActivities } from "@/lib/dayEnrichers";
import { resolveTripLocale } from "@/lib/tripLocale";

const FILLER =
  /jutranji sprehod|kava pred ogledom|morning walk|pavza na trgu|aperitivo \/ lokalna|lokalna večerja|café break|glavni dopoldanski/i;

describe("continent pools no longer inject worldwide fillers", () => {
  it("Paris (europe) stays empty instead of morning-walk templates", () => {
    const locale = resolveTripLocale("CDG", "Paris", "sl");
    const out = enrichDayActivities(
      { morning: [], afternoon: [], evening: [] },
      "Paris",
      2,
      locale,
      { plannedSights: 0 },
    );
    const names = [...out.morning, ...out.afternoon, ...out.evening].map((a) => a.name).join(" ");
    expect(names).not.toMatch(FILLER);
    expect(out.morning).toHaveLength(0);
  });

  it("New York (americas) does not get coffee-before-the-sight", () => {
    const locale = resolveTripLocale("JFK", "New York", "sl");
    const out = enrichDayActivities(
      { morning: [], afternoon: [], evening: [] },
      "New York",
      2,
      locale,
      { plannedSights: 0, destinationIata: "JFK" },
    );
    const names = [...out.morning, ...out.afternoon, ...out.evening].map((a) => a.name).join(" ");
    expect(names).not.toMatch(FILLER);
    expect(out.morning).toHaveLength(0);
  });
});
