import { describe, expect, it } from "vitest";
import { extractHeroChatDates } from "@/lib/heroChatDates";

describe("extractHeroChatDates", () => {
  it("detects exact single day (SL)", () => {
    const result = extractHeroChatDates("Mehika 15. julij", "sl");
    expect(result.precision).toBe("exact");
    expect(result.label).toMatch(/15.*jul/i);
    expect(result.departDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("detects exact date range (SL)", () => {
    const result = extractHeroChatDates("od 20. do 30. avgusta na Bali", "sl");
    expect(result.precision).toBe("exact");
    expect(result.label).toMatch(/20.*30.*avg/i);
    expect(result.departDate).toBeTruthy();
    expect(result.returnDate).toBeTruthy();
  });

  it("detects exact date (EN)", () => {
    const result = extractHeroChatDates("Trip to Japan on July 15th", "en");
    expect(result.precision).toBe("exact");
    expect(result.label.toLowerCase()).toMatch(/july|15/);
  });

  it("detects vague month only", () => {
    const result = extractHeroChatDates("Mehika oktober", "sl");
    expect(result.precision).toBe("vague");
    expect(result.label.toLowerCase()).toMatch(/okt/);
    expect(result.departDate).toMatch(/^\d{4}-10-15$/);
  });

  it("parses Slovenian genitive end/start month range without re-asking", () => {
    const result = extractHeroChatDates("tajska konec oktobra začetek novembra", "sl");
    expect(result.precision).toBe("exact");
    expect(result.departDate).toMatch(/^\d{4}-10-26$/);
    expect(result.returnDate).toMatch(/^\d{4}-11-05$/);
  });

  it("detects vague relative period", () => {
    expect(extractHeroChatDates("čez 2 tedna v Italijo", "sl").precision).toBe("vague");
    expect(extractHeroChatDates("konec poletja na Hrvaškem", "sl").precision).toBe("vague");
  });

  it("returns none when no dates mentioned", () => {
    expect(extractHeroChatDates("Potovanje na Bali", "sl").precision).toBe("none");
  });
});
