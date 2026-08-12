import { describe, expect, it } from "vitest";
import type { AiTripPlan } from "@/lib/aiPlan.functions";
import {
  buildTravelPlanRow,
  isAuthPersistError,
  isNoRowLookupError,
  isPayloadTooLargeError,
  planForDatabase,
  serializePlanForDb,
  slimPlanForDb,
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

describe("isNoRowLookupError", () => {
  it("treats PostgREST 0-row object coercion as empty, not fatal", () => {
    expect(isNoRowLookupError({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" })).toBe(
      true,
    );
    expect(isNoRowLookupError({ status: 406, message: "Not Acceptable" })).toBe(true);
    expect(isNoRowLookupError({ code: "42501", message: "permission denied" })).toBe(false);
  });
});

describe("slimPlanForDb", () => {
  it("drops photo URLs so a first save is not blocked by payload size", () => {
    const slim = slimPlanForDb({
      destinationName: "Balkan",
      days: [
        {
          day: 1,
          city: "Zadar",
          imageUrl: "https://example.com/huge.jpg",
          activities: {
            morning: [
              {
                name: "Old town",
                imageUrl: "https://example.com/a.jpg",
                tripAdvisorStyleDetails: { blurb: "x".repeat(5000) } as never,
              },
            ],
          },
        },
      ],
    } as unknown as AiTripPlan);
    expect(slim.days[0]!.imageUrl).toBeUndefined();
    expect(slim.days[0]!.activities?.morning?.[0]?.imageUrl).toBeUndefined();
    expect(slim.days[0]!.activities?.morning?.[0]?.tripAdvisorStyleDetails).toBeUndefined();
  });
});

describe("payload errors", () => {
  it("detects oversized jsonb / HTTP 413", () => {
    expect(isPayloadTooLargeError("Payload too large")).toBe(true);
    expect(isPayloadTooLargeError("new row violates row-level security")).toBe(false);
  });
});

describe("isAuthPersistError", () => {
  it("treats expired JWT and RLS as login/session problems", () => {
    expect(isAuthPersistError("JWT expired")).toBe(true);
    expect(isAuthPersistError("new row violates row-level security policy")).toBe(true);
    expect(isAuthPersistError("Unauthorized: Invalid token.")).toBe(true);
    expect(isAuthPersistError("Payload too large")).toBe(false);
  });
});

describe("planForDatabase", () => {
  it("keeps a small plan intact", () => {
    const plan = {
      destinationName: "Balkan",
      days: [{ day: 1, city: "Zadar", imageUrl: "https://example.com/a.jpg" }],
    } as unknown as AiTripPlan;
    expect(planForDatabase(plan)).toBe(plan);
  });

  it("slims when serialized JSON is huge", () => {
    const plan = {
      destinationName: "Balkan",
      days: Array.from({ length: 12 }, (_, i) => ({
        day: i + 1,
        city: "Zadar",
        imageUrl: `https://example.com/${"x".repeat(12_000)}.jpg`,
      })),
    } as unknown as AiTripPlan;
    const out = planForDatabase(plan);
    expect(out.days[0]!.imageUrl).toBeUndefined();
  });
});
