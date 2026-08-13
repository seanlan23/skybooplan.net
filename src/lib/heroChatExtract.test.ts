import { describe, expect, it } from "vitest";
import {
  extractHeroChatPassengers,
  formatPassengersLabel,
  resolveHeroChatBootstrap,
} from "@/lib/heroChatExtract";

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

  it("appends rooms on the stays label", () => {
    expect(formatPassengersLabel(2, 1, "sl", 2)).toBe("2 odrasla + 1 otrok · 2 sobi");
  });

  it("parses party size without adult/child words", () => {
    expect(extractHeroChatPassengers("nas je 4", "sl")).toMatchObject({
      adults: 4,
      children: 0,
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
    expect(result.tripReady).toBe(true);
    expect(result.passengers?.label).toContain("2 odrasla");
  });

  it("asks only for passengers when a rich trip prompt has dates but no party size", () => {
    const result = resolveHeroChatBootstrap(
      "Ljubljana → potovanje na jug tajske po možnosti prihod in odhod iz phuketa. Konec oktobra zaetek novembra za 14 nočitev. Let naj bo oi lj, dunaja, milana, zagreba ali budimšete. Cena in cae potovanja sta najpomebnejša",
      "sl",
    );
    expect(result.nextStep).toBe("passengers");
    expect(result.tripReady).toBe(true);
    expect(result.passengers).toBeNull();
    expect(result.dates.departDate).toBeTruthy();
  });

  it("asks for dates when the first message has no usable dates", () => {
    const result = resolveHeroChatBootstrap("potovanje na Bali", "sl");
    expect(result.nextStep).toBe("dates");
    expect(result.tripReady).toBe(false);
  });
});
