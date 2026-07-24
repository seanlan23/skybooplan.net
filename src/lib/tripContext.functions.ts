import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { lookupDestination } from "@/lib/destinationCoords";
import {
  attachSkeletonAstronomy,
  buildTripAstronomy,
  isCoastalTripCity,
  lookupCoastalCoords,
} from "@/lib/lunarTides";
import { planLangCopy } from "@/lib/planLangCopy";
import { inferLikelyRegionCities, buildTripClimate } from "@/lib/seasonalHints";

const Input = z.object({
  destinationIata: z.string().min(2).max(80),
  tripDate: z.string().min(10).max(10),
  returnDate: z.string().min(10).max(10).optional().or(z.literal("")),
  language: z.string().min(2).max(5).optional(),
  priorities: z.array(z.string()).optional(),
  wishes: z.string().max(2000).optional(),
  /** When set (from plan days), region climate tips only cover these cities. */
  regionCities: z.array(z.string().min(1).max(80)).max(24).optional(),
});

export type DestinationContext = {
  destinationName: string;
  tempC: number | null;
  weatherLabel: string | null;
  seasonalHints: string[];
  /** Phase 2 — per-city monsoon / rainforest notes for multi-stop trips. */
  regionClimate: Array<{ city: string; hints: string[] }>;
  /** Phase 3 — moon phase, bioluminescence, tide notes. */
  astronomyHints: string[];
  hemisphere: "north" | "south" | null;
};

function weatherLabel(code: number, lang: string): string {
  if (code === 0) {
    return planLangCopy(lang, {
      sl: "jasno",
      en: "clear",
      it: "sereno",
      es: "despejado",
      fr: "clair",
      de: "klar",
    });
  }
  if (code <= 3) {
    return planLangCopy(lang, {
      sl: "delno oblačno",
      en: "partly cloudy",
      it: "parzialmente nuvoloso",
      es: "parcialmente nublado",
      fr: "partiellement nuageux",
      de: "teilweise bewölkt",
    });
  }
  if (code <= 48) {
    return planLangCopy(lang, {
      sl: "megla",
      en: "fog",
      it: "nebbia",
      es: "niebla",
      fr: "brouillard",
      de: "Nebel",
    });
  }
  if (code <= 67) {
    return planLangCopy(lang, {
      sl: "dež",
      en: "rain",
      it: "pioggia",
      es: "lluvia",
      fr: "pluie",
      de: "Regen",
    });
  }
  if (code <= 77) {
    return planLangCopy(lang, {
      sl: "sneg",
      en: "snow",
      it: "neve",
      es: "nieve",
      fr: "neige",
      de: "Schnee",
    });
  }
  if (code <= 82) {
    return planLangCopy(lang, {
      sl: "plohe",
      en: "showers",
      it: "rovesci",
      es: "chubascos",
      fr: "averses",
      de: "Schauer",
    });
  }
  if (code <= 99) {
    return planLangCopy(lang, {
      sl: "nevihta",
      en: "thunderstorm",
      it: "temporale",
      es: "tormenta",
      fr: "orage",
      de: "Gewitter",
    });
  }
  return planLangCopy(lang, {
    sl: "spremenljivo",
    en: "variable",
    it: "variabile",
    es: "variable",
    fr: "variable",
    de: "wechselhaft",
  });
}

async function fetchCurrentWeather(
  lat: number,
  lng: number,
): Promise<{ tempC: number; code: number } | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,weather_code&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const tempC = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (typeof tempC !== "number" || typeof code !== "number") return null;
    return { tempC: Math.round(tempC), code };
  } catch {
    return null;
  }
}

export const getDestinationContext = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<DestinationContext> => {
    const lang = data.language ?? "sl";
    const regionCities =
      data.regionCities?.map((c) => c.trim()).filter(Boolean).length
        ? [...new Set(data.regionCities.map((c) => c.trim()).filter(Boolean))]
        : inferLikelyRegionCities(data.destinationIata, data.priorities);
    const climate = buildTripClimate({
      destinationIata: data.destinationIata,
      departDate: data.tripDate,
      returnDate: data.returnDate || undefined,
      lang,
      priorities: data.priorities,
      wishes: data.wishes,
      regionCities,
    });
    const dest = lookupDestination(data.destinationIata);
    const coastalRegions = regionCities
      .filter(isCoastalTripCity)
      .map((city) => {
        const coords = lookupCoastalCoords(city) ?? (dest ? { lat: dest.lat, lng: dest.lng } : null);
        return coords ? { city, lat: coords.lat, lng: coords.lng } : null;
      })
      .filter((r): r is { city: string; lat: number; lng: number } => r !== null);

    const tideByRegion =
      coastalRegions.length > 0
        ? (
            await attachSkeletonAstronomy(
              coastalRegions,
              data.tripDate,
              data.returnDate || undefined,
            )
          ).tideByRegion
        : undefined;
    const astronomy = buildTripAstronomy({
      departDate: data.tripDate,
      returnDate: data.returnDate || undefined,
      lang,
      lat: dest?.lat,
      lng: dest?.lng,
      destinationLabel: dest?.name ?? data.destinationIata,
      regionCities,
      tideByDate: tideByRegion
        ? Object.values(tideByRegion)[0]
        : undefined,
    });

    if (!dest) {
      return {
        destinationName: data.destinationIata,
        tempC: null,
        weatherLabel: null,
        seasonalHints: climate.tripClimate,
        regionClimate: climate.regionClimate,
        astronomyHints: astronomy.tripHints,
        hemisphere: null,
      };
    }

    const weather = await fetchCurrentWeather(dest.lat, dest.lng);
    const hemisphere = dest.lat < 0 ? "south" : dest.lat > 0 ? "north" : null;

    return {
      destinationName: dest.name,
      tempC: weather?.tempC ?? null,
      weatherLabel: weather ? weatherLabel(weather.code, lang) : null,
      seasonalHints: climate.tripClimate,
      regionClimate: climate.regionClimate,
      astronomyHints: astronomy.tripHints,
      hemisphere,
    };
  });
