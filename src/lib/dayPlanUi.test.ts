import { describe, expect, it } from "vitest";
import { formatDayCardTitle } from "@/lib/dayPlanUi";

describe("formatDayCardTitle", () => {
  it("prefixes a plain title", () => {
    expect(formatDayCardTitle({ day: 2, title: "Prihod v Bangkok" }, "Dan")).toBe(
      "Dan 2: Prihod v Bangkok",
    );
  });

  it("does not duplicate Dan N when title already has prefix", () => {
    expect(formatDayCardTitle({ day: 1, title: "Dan 1: Mednarodni let" }, "Dan")).toBe(
      "Dan 1: Mednarodni let",
    );
  });

  it("keeps collapsed island span title as-is", () => {
    expect(
      formatDayCardTitle(
        { day: 11, dayEnd: 12, title: "Koh Lipe — prosti dnevi na otoku" },
        "Dan",
      ),
    ).toBe("Koh Lipe — prosti dnevi na otoku");
  });
});
