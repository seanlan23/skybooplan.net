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
      pace: "Sproščen",
      budget: "500–1000€",
    });

    expect(ctx.from).toBe("LJU");
    expect(ctx.to).toBe("JFK");
    expect(ctx.departDate).toBe("2027-07-01");
    expect(ctx.returnDate).toBe("2027-07-08");
    expect(ctx.adults).toBe(2);
    expect(form.budget).toBe("standard");
  });

  it("puts only locationWishes into form.wishes (not destination/dates dump)", () => {
    const { form } = heroChatToPlannerPayload({
      destination: "Thailand",
      dates: "Konec oktobra",
      nights: "",
      origin: "Ljubljana",
      passengers: "2 odrasla",
      pace: "Sproščen",
      budget: "1000–2000€ / osebo",
      locationWishes: "Chiang Mai, otoki na jugu",
    });

    expect(form.wishes).toMatch(/Želje \(obvezno upoštevaj mesta\/lokacije\):\s*Chiang Mai, otoki na jugu/);
    expect(form.wishes).not.toMatch(/Destinacija:/);
    expect(form.wishes).not.toMatch(/Proračun:/);
  });

  it("resolves city names to IATA", () => {
    expect(resolveOriginIata("Zagreb")).toBe("ZAG");
    expect(resolveDestinationIata("Bali")).toBe("DPS");
    expect(resolveDestinationIata("🏯 Japonska")).toBe("NRT");
    expect(resolveDestinationIata("🏔️ Slovenija")).toBe("LJU");
    expect(resolveDestinationIata("Croatia")).toBe("SPU");
    expect(resolveDestinationIata("Dubai")).toBe("DXB");
    expect(resolveDestinationIata("🏙️ Dubaj")).toBe("DXB");
  });

  it("resolves south Thailand / Phuket prompts to HKT", () => {
    expect(
      resolveDestinationIata(
        "potovanje na jug tajske po možnosti prihod in odhod iz phuketa",
      ),
    ).toBe("HKT");
  });

  it("does not invent IATA codes from arbitrary city names", () => {
    expect(resolveDestinationIata("Narava")).toBe("");
  });

  it("parses Slovenian month labels", () => {
    expect(parseChatDepartDate("Avgust 2027")).toBe("2027-08-01");
  });

  it("keeps exact calendar return date instead of default 7 nights", () => {
    const { ctx } = heroChatToPlannerPayload(
      {
        destination: "Thailand",
        dates: "26. okt → 10. nov 2026",
        nights: "",
        origin: "Munich (MUC)",
        passengers: "3 odraslih",
        pace: "Sproščen",
        budget: "1000–2000€ / osebo",
      },
      "sl",
    );
    expect(ctx.departDate).toBe("2026-10-26");
    expect(ctx.returnDate).toBe("2026-11-10");
  });

  it("parses passenger strings", () => {
    expect(parseChatPassengers("2 odrasla + 1 otrok")).toEqual({
      adults: 2,
      childrenAges: [8],
    });
  });

  it("tolerates missing chat fields before passengers/dates are collected", () => {
    expect(parseChatPassengers(undefined)).toEqual({ adults: 1, childrenAges: [] });
    expect(parseChatDepartDate(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const { ctx } = heroChatToPlannerPayload(
      {
        destination: "Thailand",
        dates: "",
        nights: "",
        origin: "",
        passengers: "",
        pace: "",
        budget: "",
      },
      "en",
    );
    expect(ctx.to || ctx.destinationPlace).toBeTruthy();
    expect(ctx.adults).toBe(1);
  });

  it("sends country-only resort searches to a coastal airport, not the capital", () => {
    const { ctx, form } = heroChatToPlannerPayload({
      destination: "Tajska",
      dates: "1. okt → 8. okt 2026",
      nights: "",
      origin: "Ljubljana",
      passengers: "2 odrasla",
      pace: "Sproščen",
      budget: "1000–2000€",
      travelStyle: "resort",
    }, "sl");
    expect(ctx.to).toBe("HKT");
    expect(ctx.destinationPlace).toMatch(/Phuket/);
    expect(form.wishes).toMatch(/obmorsko bazo/);
  });

  it("keeps Thailand on Bangkok for explore", () => {
    const { ctx } = heroChatToPlannerPayload({
      destination: "Tajska",
      dates: "1. okt → 8. okt 2026",
      origin: "Ljubljana",
      passengers: "2 odrasla",
      travelStyle: "explore",
    });
    expect(ctx.to).toBe("BKK");
    expect(ctx.destinationPlace).toBe("Tajska");
  });

  it("parses night ranges", () => {
    expect(parseChatNights("10–14 noči")).toBe(12);
  });
});
