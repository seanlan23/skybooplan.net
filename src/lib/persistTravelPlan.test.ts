import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  buildTravelPlanRow,
  serializePlanForDb,
  toSqlDate,
} from "@/lib/persistTravelPlan";

describe("toSqlDate", () => {
  it("keeps ISO dates", () => {
    expect(toSqlDate("2026-08-14")).toBe("2026-08-14");
    expect(toSqlDate("2026-08-14T12:00:00Z")).toBe("2026-08-14");
  });

  it("rejects human labels that would break Postgres date", () => {
    expect(toSqlDate("14. avg → 24. avg 2026")).toBeNull();
    expect(toSqlDate("avgust 2026")).toBeNull();
    expect(toSqlDate("")).toBeNull();
    expect(toSqlDate(null)).toBeNull();
  });
});

describe("serializePlanForDb", () => {
  it("strips null bytes and non-finite numbers", () => {
    const plan = {
      destinationName: "Test\u0000City",
      days: [{ day: 1, city: "X", lat: Number.NaN, lng: Infinity }],
    } as unknown as AiTripPlan;
    const out = serializePlanForDb(plan) as {
      destinationName: string;
      days: Array<{ lat: number | null; lng: number | null }>;
    };
    expect(out.destinationName).toBe("TestCity");
    expect(out.days[0]?.lat).toBeNull();
    expect(out.days[0]?.lng).toBeNull();
  });
});

describe("buildTravelPlanRow", () => {
  it("falls back destination and nulls bad dates", () => {
    const row = buildTravelPlanRow(
      {
        destinationName: "",
        days: [{ day: 1, city: "Salzburg" }],
        originPlace: "Slovenj Gradec",
        destinationPlace: "North Holland, NL",
        groundTransportMode: "motorhome",
      } as AiTripPlan,
      { departDate: "14. avg 2026", returnDate: "2026-08-24" },
      "user-1",
    );
    expect(row.destination).toBe("North Holland, NL");
    expect(row.start_date).toBeNull();
    expect(row.end_date).toBe("2026-08-24");
    expect(row.user_id).toBe("user-1");
    expect(row.title).toMatch(/Slovenj Gradec/);
  });
});
