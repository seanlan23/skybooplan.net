import { describe, expect, it } from "vitest";
import { parseStayIntent } from "@/lib/stayIntent";

describe("parseStayIntent", () => {
  it("keeps a plain country as the place", () => {
    expect(parseStayIntent("Slovenia")).toEqual({ place: "Slovenia", filters: {} });
    expect(parseStayIntent("Slovenija")).toEqual({ place: "Slovenia", filters: {} });
  });

  it("reads a cabin-in-nature query without locking to a city", () => {
    const out = parseStayIntent("koča v naravi z jacuzzijem v Sloveniji");
    expect(out.place).toBe("Slovenia");
    expect(out.filters).toEqual({ cabin: true, jacuzzi: true, nature: true });
  });

  it("keeps a city when no country is mentioned", () => {
    expect(parseStayIntent("Piran")).toEqual({ place: "Piran", filters: {} });
  });

  it("extracts vibe-only queries without inventing a capital", () => {
    const out = parseStayIntent("cabin with jacuzzi");
    expect(out.place).toBe("");
    expect(out.filters).toEqual({ cabin: true, jacuzzi: true });
  });
});
