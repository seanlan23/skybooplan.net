import { describe, expect, it } from "vitest";
import { formatDayCardTitle, sortActivitiesByTime } from "@/lib/dayPlanUi";

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

describe("sortActivitiesByTime", () => {
  it("orders activities by arrivalTime ascending", () => {
    const sorted = sortActivitiesByTime([
      { name: "Prihod na letališče", arrivalTime: "14:00", departureTime: "16:00" },
      { name: "Počitek", arrivalTime: "09:00", departureTime: "12:00" },
    ]);
    expect(sorted.map((a) => a.name)).toEqual(["Počitek", "Prihod na letališče"]);
  });
});
