import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PlaceInfo = {
  query: string;
  name: string | null;
  placeId: string | null;
  photoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  countryCode: string | null;
};

const BatchInput = z.object({
  queries: z.array(z.string().min(2).max(200)).min(1).max(30),
});

const SingleInput = z.object({
  query: z.string().min(2).max(200),
});

function normalize(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

type GoogleSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    photos?: Array<{ name?: string }>;
    addressComponents?: Array<{
      shortText?: string;
      types?: string[];
    }>;
  }>;
};

type GoogleMediaResponse = {
  name?: string;
  photoUri?: string;
};

async function resolveOne(rawQuery: string, apiKey: string): Promise<PlaceInfo> {
  const query = normalize(rawQuery);
  const empty: PlaceInfo = {
    query: rawQuery,
    name: null,
    placeId: null,
    photoUrl: null,
    latitude: null,
    longitude: null,
    formattedAddress: null,
    countryCode: null,
  };

  // 1. Cache hit (and not expired)
  const { data: cached } = await supabaseAdmin
    .from("place_cache")
    .select("*")
    .eq("place_query", query)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (cached) {
    if (cached.not_found) return empty;
    return {
      query: rawQuery,
      name: cached.place_name,
      placeId: cached.google_place_id,
      photoUrl: cached.photo_url,
      latitude: cached.latitude ? Number(cached.latitude) : null,
      longitude: cached.longitude ? Number(cached.longitude) : null,
      formattedAddress: cached.formatted_address,
      countryCode: cached.country_code,
    };
  }

  // 2. Google Places Text Search (New API)
  try {
    const searchRes = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.addressComponents",
        },
        body: JSON.stringify({ textQuery: rawQuery, pageSize: 1 }),
      },
    );

    if (!searchRes.ok) {
      const text = await searchRes.text();
      console.error("Places searchText error:", searchRes.status, text);
      return empty;
    }

    const json = (await searchRes.json()) as GoogleSearchResponse;
    const place = json.places?.[0];

    if (!place) {
      await supabaseAdmin.from("place_cache").upsert(
        {
          place_query: query,
          not_found: true,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "place_query" },
      );
      return empty;
    }

    const countryCode =
      place.addressComponents?.find((c) => c.types?.includes("country"))
        ?.shortText ?? null;

    let photoUrl: string | null = null;
    const photoName = place.photos?.[0]?.name;
    if (photoName) {
      try {
        const mediaRes = await fetch(
          `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&maxWidthPx=1200&skipHttpRedirect=true`,
          {
            method: "GET",
            headers: { "X-Goog-Api-Key": apiKey },
          },
        );
        if (mediaRes.ok) {
          const media = (await mediaRes.json()) as GoogleMediaResponse;
          photoUrl = media.photoUri ?? null;
        }
      } catch (err) {
        console.error("Places photo media error:", err);
      }
    }

    const info: PlaceInfo = {
      query: rawQuery,
      name: place.displayName?.text ?? null,
      placeId: place.id ?? null,
      photoUrl,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
      formattedAddress: place.formattedAddress ?? null,
      countryCode,
    };

    await supabaseAdmin.from("place_cache").upsert(
      {
        place_query: query,
        place_name: info.name,
        google_place_id: info.placeId,
        photo_url: info.photoUrl,
        latitude: info.latitude,
        longitude: info.longitude,
        formatted_address: info.formattedAddress,
        country_code: info.countryCode,
        not_found: false,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "place_query" },
    );

    return info;
  } catch (err) {
    console.error("Places lookup failed:", err);
    return empty;
  }
}

export const getPlacePhoto = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SingleInput.parse(data))
  .handler(async ({ data }): Promise<{ place: PlaceInfo; error: string | null }> => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return {
        place: {
          query: data.query,
          name: null,
          placeId: null,
          photoUrl: null,
          latitude: null,
          longitude: null,
          formattedAddress: null,
          countryCode: null,
        },
        error: "GOOGLE_PLACES_API_KEY ni nastavljen",
      };
    }
    const place = await resolveOne(data.query, apiKey);
    return { place, error: null };
  });

export const getPlacePhotos = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BatchInput.parse(data))
  .handler(async ({ data }): Promise<{ places: PlaceInfo[]; error: string | null }> => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return {
        places: data.queries.map((q) => ({
          query: q,
          name: null,
          placeId: null,
          photoUrl: null,
          latitude: null,
          longitude: null,
          formattedAddress: null,
          countryCode: null,
        })),
        error: "GOOGLE_PLACES_API_KEY ni nastavljen",
      };
    }

    // Dedupe by normalized query so we don't pay for duplicates in one batch
    const seen = new Map<string, string>();
    for (const q of data.queries) {
      const n = normalize(q);
      if (!seen.has(n)) seen.set(n, q);
    }

    const results = await Promise.all(
      Array.from(seen.values()).map((q) => resolveOne(q, apiKey)),
    );

    const byNorm = new Map(results.map((r) => [normalize(r.query), r]));
    const places = data.queries.map(
      (q) =>
        byNorm.get(normalize(q)) ?? {
          query: q,
          name: null,
          placeId: null,
          photoUrl: null,
          latitude: null,
          longitude: null,
          formattedAddress: null,
          countryCode: null,
        },
    );

    return { places, error: null };
  });
