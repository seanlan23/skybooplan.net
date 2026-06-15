import type { WeatherWidget } from "@/lib/aiPlan.functions";
import type { DestinationContext } from "@/lib/tripContext.functions";
import { lookupDestination } from "@/lib/destinationCoords";
import { buildTripClimate } from "@/lib/seasonalHints";

/** Typical daytime range by country + month (rough climate guide for trip dates). */
const MONTH_TEMP_RANGE: Record<string, Partial<Record<number, string>>> = {
  TH: {
    1: "26–32 °C",
    2: "27–33 °C",
    3: "28–35 °C",
    4: "29–36 °C",
    5: "28–35 °C",
    6: "28–33 °C",
    7: "28–32 °C",
    8: "28–32 °C",
    9: "27–31 °C",
    10: "27–32 °C",
    11: "26–31 °C",
    12: "25–30 °C",
  },
  PH: { 6: "27–32 °C", 7: "27–32 °C", 8: "27–32 °C", 12: "26–30 °C", 1: "26–30 °C" },
  VN: { 7: "28–35 °C", 8: "28–34 °C", 1: "18–24 °C", 2: "19–25 °C" },
  ID: { 7: "27–31 °C", 8: "27–31 °C", 4: "27–32 °C" },
};

function monthFromIso(iso?: string): number | null {
  const m = iso?.match(/^\d{4}-(\d{2})-/);
  if (!m) return null;
  const month = Number(m[1]);
  return month >= 1 && month <= 12 ? month : null;
}

function clothingFromHints(hints: string[], lang: string): string {
  const blob = hints.join(" ").toLowerCase();
  const sl = lang.startsWith("sl");
  if (/dež|rain|monsun|monsoon|plohe|shower/i.test(blob)) {
    return sl
      ? "Lahek raincoat, dihalna oblačila, zaprti čevlji za dež."
      : "Light rain jacket, breathable clothes, closed shoes for rain.";
  }
  if (/vroč|hot|40|heat/i.test(blob)) {
    return sl
      ? "Zelo lahka oblačila, kapa, veliko vode, klimatizirani prostori."
      : "Very light clothes, hat, plenty of water, air-conditioned breaks.";
  }
  if (/hlad|cool|cold|zima|winter/i.test(blob)) {
    return sl ? "Plašč ali jakna za večer, sloji za jutro." : "Jacket for evenings, layers for mornings.";
  }
  return sl
    ? "Lahka oblačila, udobni čevlji, kapa proti soncu."
    : "Light clothes, comfortable shoes, sun hat.";
}

export function buildWeatherWidgetFallback(opts: {
  destinationIata?: string;
  departDate?: string;
  returnDate?: string;
  lang?: string;
  priorities?: string[];
  wishes?: string;
  context?: DestinationContext | null;
  planSummary?: string;
}): WeatherWidget | undefined {
  const lang = opts.lang ?? "sl";
  const iata = opts.destinationIata?.trim().toUpperCase();
  const dest = iata ? lookupDestination(iata) : null;
  const month = monthFromIso(opts.departDate);

  const climate =
    iata && opts.departDate
      ? buildTripClimate({
          destinationIata: iata,
          departDate: opts.departDate,
          returnDate: opts.returnDate,
          lang,
          priorities: opts.priorities,
          wishes: opts.wishes,
        })
      : { tripClimate: [], regionClimate: [] };

  const hints = [
    ...(opts.context?.seasonalHints ?? []),
    ...climate.tripClimate,
    ...(opts.context?.regionClimate?.flatMap((r) => r.hints) ?? []),
  ].filter(Boolean);

  const season =
    hints[0]?.trim() ||
    opts.context?.weatherLabel ||
    (lang.startsWith("sl") ? "Sezonske razmere na destinaciji" : "Season at destination");

  let avgTemp = "";
  if (opts.context?.tempC != null) {
    avgTemp = `${opts.context.tempC}°C`;
  } else if (dest && month && MONTH_TEMP_RANGE[dest.country]?.[month]) {
    avgTemp = MONTH_TEMP_RANGE[dest.country]![month]!;
  } else if (month && iata === "BKK") {
    avgTemp = MONTH_TEMP_RANGE.TH?.[month] ?? "28–32 °C";
  }

  const clothing = clothingFromHints(hints, lang);
  if (!avgTemp && !hints.length) {
    const summary = opts.planSummary?.trim();
    if (!summary) return undefined;
    return {
      season: summary.slice(0, 120),
      avgTemp: lang.startsWith("sl") ? "Preveri vremensko napoved" : "Check weather forecast",
      clothing,
    };
  }

  if (!season || !clothing) return undefined;
  return {
    season,
    avgTemp: avgTemp || (lang.startsWith("sl") ? "Toplo do vroče" : "Warm to hot"),
    clothing,
  };
}
