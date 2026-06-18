import { describe, expect, it } from "vitest";
import {
  heroChatToPlannerPayload,
  parseChatDepartDate,
  parseChatNights,
  parseChatPassengers,
  resolveDestinationIata,
  resolveOriginIata,
} from "@/lib/heroChatPlanner";

describe("heroChatPlanner", () => {
  it("maps chat answers to planner context", () => {
    const { ctx, form } = heroChatToPlannerPayload({
      destination: "New York",
      dates: "Julij 2027",
      nights: "7 noči",
      origin: "Ljubljana",
      passengers: "2 odrasla",
      budget: "500–1000€",
    });

    expect(ctx.from).toBe("LJU");
    expect(ctx.to).toBe("JFK");
    expect(ctx.departDate).toBe("2027-07-01");
    expect(ctx.returnDate).toBe("2027-07-08");
    expect(ctx.adults).toBe(2);
    expect(form.budget).toBe("standard");
  });

  it("resolves city names to IATA", () => {
    expect(resolveOriginIata("Zagreb")).toBe("ZAG");
    expect(resolveDestinationIata("Bali")).toBe("DPS");
    expect(resolveDestinationIata("🏯 Japonska")).toBe("NRT");
  });

  it("does not invent IATA codes from arbitrary city names", () => {
    expect(resolveDestinationIata("Narava")).toBe("");
  });

  it("parses Slovenian month labels", () => {
    expect(parseChatDepartDate("Avgust 2027")).toBe("2027-08-01");
  });

  it("parses passenger strings", () => {
    expect(parseChatPassengers("2 odrasla + 1 otrok")).toEqual({
      adults: 2,
      childrenAges: [8],
    });
  });

  it("parses night ranges", () => {
    expect(parseChatNights("10–14 noči")).toBe(12);
  });
});
