import { describe, expect, it } from "vitest";
import {
  buildWeatherWidgetFallback,
  weatherWidgetNeedsClimateFallback,
} from "@/lib/weatherWidgetFallback";

describe("buildWeatherWidgetFallback Balkan road trip", () => {
  it("uses Adriatic summer temps without an IATA hub", () => {
    const w = buildWeatherWidgetFallback({
      destinationPlace: "Balkan Zadar Split Mostar Kotor Shkoder Dubrovnik",
      departDate: "2026-07-24",
      lang: "en",
    });
    expect(w?.avgTemp).toMatch(/24–34/);
    expect(w?.season).toMatch(/Adriatic|Croatia|Montenegro|Albania/i);
    expect(w?.avgTemp).not.toMatch(/Check weather forecast/i);
    expect(w?.season).not.toMatch(/^This \d+-day/i);
  });
});

describe("Mexico / Yucatán climate", () => {
  it("does not call Riviera Maya the Adriatic", () => {
    const w = buildWeatherWidgetFallback({
      destinationIata: "CUN",
      destinationPlace: "Mehika (Yucatán) Riviera Maya",
      departDate: "2026-09-12",
      lang: "sl",
    });
    expect(w?.season).not.toMatch(/Jadran/i);
    expect(w?.avgTemp).toMatch(/26–32|25–31|Toplo/i);
  });

  it("replaces a Gemini Adriatic season on a Cancún ticket", () => {
    expect(
      weatherWidgetNeedsClimateFallback(
        {
          season: "Hladnejša sezona na Jadranu — jakna za večer, manj kopanja.",
          avgTemp: "32°C",
          clothing: "Lahka oblačila.",
        },
        { destinationIata: "CUN", destinationPlace: "Mehika (Yucatán)" },
      ),
    ).toBe(true);
  });
});

describe("weatherWidgetNeedsClimateFallback", () => {
  it("replaces trip-summary season plus check-forecast stub", () => {
    expect(
      weatherWidgetNeedsClimateFallback({
        season:
          "This 11-day road trip takes you through the stunning landscapes of Bosnia and Herzegovina, Montenegro.",
        avgTemp: "Check weather forecast",
        clothing: "Light clothes, comfortable shoes, sun hat.",
      }),
    ).toBe(true);
  });

  it("keeps a real climate widget", () => {
    expect(
      weatherWidgetNeedsClimateFallback({
        season: "High summer on the Adriatic",
        avgTemp: "24–34 °C",
        clothing: "Light clothes, comfortable shoes, sun hat.",
      }),
    ).toBe(false);
  });
});
