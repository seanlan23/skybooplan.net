import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { rankAirportSuggestions } from "@/lib/airportRank";
import { rankWesternBalkansPlaces } from "@/lib/placesBalkan";
import { checkPlacesSearchRateLimit, extractIp } from "@/lib/quota.server";

export type PlaceSuggestion = {
  iata: string;
  name: string;
  city: string;
  country: string;
  type: "airport" | "city";
};

const QuerySchema = z.object({
  query: z.string().min(2).max(60),
  kind: z.enum(["airport", "place"]).default("airport"),
  language: z.string().min(2).max(5).optional(),
});

type DuffelPlace = {
  iata_code: string | null;
  name: string;
  type: "airport" | "city";
  iata_city_code?: string | null;
  city_name?: string | null;
  city?: { name?: string | null } | null;
  iata_country_code?: string | null;
};

type MapboxFeature = {
  id: string;
  text?: string;
  place_name?: string;
  place_type?: string[];
  properties?: { short_code?: string };
  context?: Array<{ id?: string; text?: string; short_code?: string }>;
};

export const searchPlaces = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => QuerySchema.parse(data))
  .handler(async ({ data }): Promise<{ suggestions: PlaceSuggestion[]; error: string | null }> => {
    const request = getRequest();
    const ip = extractIp(request?.headers ?? new Headers());
    if (!checkPlacesSearchRateLimit(ip).allowed) {
      return { suggestions: [], error: "error.placesRateLimit" };
    }

    if (data.kind === "place") {
      const token = process.env.MAPBOX_PUBLIC_TOKEN;
      if (!token) return { suggestions: [], error: "MAPBOX_PUBLIC_TOKEN ni nastavljen" };

      try {
        const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(data.query)}.json`);
        url.searchParams.set("types", "place,locality,region,country");
        const lang = (data.language ?? "en").slice(0, 2).toLowerCase();
        url.searchParams.set("language", lang === "sl" || lang === "de" ? lang : "en");
        url.searchParams.set("autocomplete", "true");
        url.searchParams.set("limit", "8");
        url.searchParams.set("access_token", token);

        const res = await fetch(url.toString());
        if (!res.ok) {
          const text = await res.text();
          console.error("Mapbox places error:", res.status, text);
          return { suggestions: [], error: `Mapbox API napaka (${res.status})` };
        }

        const json = (await res.json()) as { features?: MapboxFeature[] };
        const suggestions: PlaceSuggestion[] = (json.features ?? []).map((feature) => {
          const countryCtx = feature.context?.find((item) => item.id?.startsWith("country"));
          const regionCtx = feature.context?.find((item) => item.id?.startsWith("region"));
          const country = (countryCtx?.short_code ?? feature.properties?.short_code ?? "")
            .replace(/^[a-z]{2}-/i, "")
            .toUpperCase();
          const cityName = feature.text ?? feature.place_name ?? data.query;

          return {
            iata: feature.id,
            name: cityName,
            city: regionCtx?.text && regionCtx.text !== cityName ? regionCtx.text : cityName,
            country,
            type: "city" as const,
          };
        });

        return { suggestions: rankWesternBalkansPlaces(data.query, suggestions), error: null };
      } catch (err) {
        console.error("Mapbox places fetch failed:", err);
        return { suggestions: [], error: "Predlogi trenutno niso na voljo" };
      }
    }

    const token = process.env.DUFFEL_API_KEY;
    if (!token) return { suggestions: [], error: "DUFFEL_API_KEY ni nastavljen" };

    try {
      const url = new URL("https://api.duffel.com/places/suggestions");
      url.searchParams.set("query", data.query);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Duffel-Version": "v2",
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Duffel places error:", res.status, text);
        return { suggestions: [], error: `error.duffelApi:${res.status}` };
      }

      const json = (await res.json()) as { data: DuffelPlace[] };

      const raw: PlaceSuggestion[] = (json.data ?? [])
        .filter((p) => (data.kind === "place" ? p.type === "city" : !!p.iata_code))
        .map((p) => ({
          iata: (p.iata_code ?? p.iata_city_code ?? "").toUpperCase(),
          name: p.name,
          city: p.city?.name ?? p.city_name ?? "",
          country: p.iata_country_code ?? "",
          type: p.type,
        }))
        .filter((p) => p.iata.length === 3);

      const suggestions = rankAirportSuggestions(data.query, raw);

      return { suggestions, error: null };
    } catch (err) {
      console.error("Duffel places fetch failed:", err);
      return { suggestions: [], error: "Predlogi trenutno niso na voljo" };
    }
  });
