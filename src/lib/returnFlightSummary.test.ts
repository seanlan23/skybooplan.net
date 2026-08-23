import { describe, expect, it } from "vitest";
import {
  buildReturnFlightSummary,
  parsePostankiLeg,
  sanitizeReturnFlightSummary,
} from "@/lib/returnFlightSummary";

describe("parsePostankiLeg", () => {
  it("parses outbound/inbound with via", () => {
    expect(parsePostankiLeg("1|AUH/1|AUH", "outbound")).toEqual({
      stops: 1,
      via: "AUH",
    });
    expect(parsePostankiLeg("1|AUH/1|AUH", "inbound")).toEqual({
      stops: 1,
      via: "AUH",
    });
  });

  it("parses nonstop", () => {
    expect(parsePostankiLeg("0/0", "inbound")).toEqual({ stops: 0 });
  });
});

describe("sanitizeReturnFlightSummary", () => {
  it("strips false Direct flight claims when stops unknown", () => {
    const out = sanitizeReturnFlightSummary(
      "Direct flight from Phuket (HKT) to Munich (MUC)",
      { fromIata: "HKT", toIata: "MUC", language: "en" },
    );
    expect(out.toLowerCase()).not.toContain("direct");
    expect(out).toMatch(/HKT/);
    expect(out).toMatch(/MUC/);
  });

  it("states connecting flight when stops known", () => {
    const out = buildReturnFlightSummary({
      fromIata: "HKT",
      toIata: "MUC",
      language: "en",
      stops: 1,
      via: "AUH",
      depart: "20:50",
      arrive: "06:00",
    });
    expect(out.toLowerCase()).toContain("1 stop");
    expect(out).toContain("AUH");
    expect(out.toLowerCase()).not.toContain("direct");
  });

  it("writes German copy when the UI language is de", () => {
    const out = buildReturnFlightSummary({
      fromIata: "SJJ",
      toIata: "HAM",
      language: "de",
      stops: 1,
      depart: "19:15",
      arrive: "08:25",
    });
    expect(out).toMatch(/Flug SJJ → HAM mit 1 Zwischenstopp/);
    expect(out).toMatch(/Abflug 19:15, Ankunft 08:25/);
    expect(out).not.toMatch(/Flight |Depart |1 stop/i);
  });
});
