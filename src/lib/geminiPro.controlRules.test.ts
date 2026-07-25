import { describe, expect, it } from "vitest";
import { tripPlanControlRules, tripPlanSystemPrompt } from "@/lib/geminiPro";
import type { GenerateTripPlanParams } from "@/lib/geminiPro.shared";

function baseParams(
  overrides?: Partial<GenerateTripPlanParams>,
): GenerateTripPlanParams {
  return {
    originIata: "MUC",
    destinationIata: "HKT",
    destination: "Phuket",
    month: "oktober",
    days: 16,
    departDate: "2026-10-26",
    returnDate: "2026-11-10",
    pax: { adults: 3, childrenAges: [] },
    budget: "standard",
    wishTags: [],
    pace: "calm",
    customWishes:
      "prvo noč phuket, 3 noči khao sok, 2 noči ao nang, 5 noči koh phi phi 2 noči patong",
    flightContext: {
      outboundDepart: "21:10",
      outboundArrive: "18:55",
      outboundArriveDayOffset: 1,
      inboundDepart: "15:30",
      inboundArrive: "06:00",
    },
    language: "sl",
    currency: "EUR",
    ...overrides,
  };
}

describe("tripPlanControlRules", () => {
  it("puts wishes and flight above full-day packing", () => {
    const block = tripPlanControlRules({
      pace: "calm",
      hasFlightContext: true,
      explicitStayPlan: true,
      arrivalCity: "Phuket",
      destinationIata: "HKT",
      arrivalDay: 2,
    });
    expect(block).toMatch(/HIERARHIJA PRAVIL/);
    expect(block).toMatch(/ABSOLUTNO PREDNOST/);
    expect(block).toMatch(/Dan prihoda = dan 2/);
    expect(block).toMatch(/Zajtrk ob morju/);
    expect(block).toMatch(/TEMPO MIREN/);
    expect(block).toMatch(/fleksibilno/);
    expect(block).toMatch(/STROGI JSON/);
    expect(block).toMatch(/BREZ arrivalTime\/departureTime|BREZ category airport/i);
  });

  it("system prompt no longer forces every slot filled", () => {
    const system = tripPlanSystemPrompt(baseParams());
    expect(system).toMatch(/HIERARHIJA PRAVIL/);
    expect(system).toMatch(/prazni timeSlot-i PRED\/ZA letom so OBVEZNI/);
    expect(system).not.toMatch(/Noben del dneva ne sme ostati prazen/);
    expect(system).not.toMatch(/OBVEZNA ČASOVNA STRUKTURA DNEVA \(brez izjeme\)/);
    expect(system).toMatch(/Dan prihoda na destinacijo = dan 2/);
    expect(system).toMatch(/STROGI JSON/);
    expect(system).not.toMatch(/category airport z natančno uro/i);
  });
});
