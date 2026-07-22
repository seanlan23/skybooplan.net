import { describe, expect, it } from "vitest";
import {
  didYouMeanAirport,
  formatOriginSelection,
  localizeOriginLabel,
  localizedAirportCity,
  searchAirportCatalog,
} from "@/lib/airportCatalog";

describe("airportCatalog", () => {
  it("finds Ljubljana with typo lublana", () => {
    const hits = searchAirportCatalog("lublana");
    expect(hits[0]?.iata).toBe("LJU");
  });

  it("finds Vienna from dunai typo", () => {
    const hits = searchAirportCatalog("dunai");
    expect(hits[0]?.iata).toBe("VIE");
  });

  it("finds Milan from milano", () => {
    const hits = searchAirportCatalog("milano");
    expect(hits.some((h) => h.iata === "MXP")).toBe(true);
  });

  it("matches IATA codes", () => {
    expect(searchAirportCatalog("vie")[0]?.iata).toBe("VIE");
  });

  it("suggests did-you-mean for near misses", () => {
    expect(searchAirportCatalog("budimpesta")[0]?.iata).toBe("BUD");
    const hint = didYouMeanAirport("budimpeshta");
    expect(hint?.iata).toBe("BUD");
  });

  it("formats multi-origin labels", () => {
    expect(formatOriginSelection(["LJU", "VIE"])).toBe("Ljubljana (LJU) · Vienna (VIE)");
  });

  it("localizes Munich / Vienna for Slovenian UI", () => {
    expect(localizedAirportCity({ iata: "MUC", city: "Munich" }, "sl")).toBe("München");
    expect(localizedAirportCity({ iata: "VIE", city: "Vienna" }, "sl")).toBe("Dunaj");
    expect(formatOriginSelection(["MUC"], "sl")).toBe("München (MUC)");
    expect(localizeOriginLabel("Munich (MUC)", "sl")).toBe("München (MUC)");
  });
});

