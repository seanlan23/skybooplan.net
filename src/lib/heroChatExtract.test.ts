import { describe, expect, it } from "vitest";
import { extractHeroChatPassengers, resolveHeroChatBootstrap } from "@/lib/heroChatExtract";

describe("extractHeroChatPassengers", () => {
  it("returns null when passengers were not mentioned", () => {
    expect(extractHeroChatPassengers("tajska konec oktobra", "sl")).toBeNull();
  });

  it("parses Slovenian adults and children", () => {
    const result = extractHeroChatPassengers("2 odrasla + 1 otrok", "sl");
    expect(result).toEqual({
      adults: 2,
      children: 1,
      label: "2 odrasla + 1 otrok",
    });
  });
});

describe("resolveHeroChatBootstrap", () => {
  it("searches immediately when destination, dates and passengers are in one message", () => {
    const result = resolveHeroChatBootstrap(
      "tajska 14 dni konec oktobra začetek novembra, 2 odrasla + 1 otrok, letališča Lj Dunaj",
      "sl",
    );
    expect(result.nextStep).toBe("search");
    expect(result.canSearchNow).toBe(true);
    expect(result.passengers?.label).toContain("2 odrasla");
    expect(result.dates.departDate).toMatch(/10-26/);
  });

  it("asks for passengers when only destination and dates are present", () => {
    const result = resolveHeroChatBootstrap("tajska konec oktobra začetek novembra", "sl");
    expect(result.nextStep).toBe("passengers");
    expect(result.dates.departDate).toBeTruthy();
  });
});
