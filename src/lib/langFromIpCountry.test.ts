import { describe, expect, it } from "vitest";
import { langFromIpCountry } from "@/lib/langFromIpCountry";

describe("langFromIpCountry", () => {
  it("maps Slovenia to Slovenian", () => {
    expect(langFromIpCountry("SI")).toBe("sl");
    expect(langFromIpCountry("si")).toBe("sl");
  });

  it("maps DE / AT / CH to German", () => {
    expect(langFromIpCountry("DE")).toBe("de");
    expect(langFromIpCountry("AT")).toBe("de");
    expect(langFromIpCountry("CH")).toBe("de");
  });

  it("defaults everything else to English", () => {
    expect(langFromIpCountry("US")).toBe("en");
    expect(langFromIpCountry("FR")).toBe("en");
    expect(langFromIpCountry("xx")).toBe("en");
    expect(langFromIpCountry(null)).toBe("en");
    expect(langFromIpCountry(undefined)).toBe("en");
    expect(langFromIpCountry("")).toBe("en");
  });
});
