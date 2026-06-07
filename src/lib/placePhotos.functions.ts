import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchWithTimeout,
  HTTP_API_TIMEOUT_MS,
  pipelineLog,
  runWithConcurrency,
  withTimeout,
} from "@/lib/asyncTimeout";

export type PlaceInfo = {
  query: string;
  name: string | null;
  placeId: string | null;
  photoUrl: string | null;
  /** Up to 3 photos for modal grids. */
  photoUrls?: string[];
  latitude: number | null;
  longitude: number | null;
  formattedAddress: string | null;
  countryCode: string | null;
};

const PLACES_CONCURRENCY = 4;
/** Hard cap for an entire batch — prevents multi-minute hangs. */
const PLACES_BATCH_HARD_CAP_MS = 90_000;

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

function emptyPlaceInfo(rawQuery: string): PlaceInfo {
  return {
    query: rawQuery,
    name: null,
    placeId: null,
    photoUrl: null,
    latitude: null,
    longitude: null,
    formattedAddress: null,
    countryCode: null,
  };
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
  const empty = emptyPlaceInfo(rawQuery);

  try {
    const { data: cached } = await withTimeout(
      supabaseAdmin
        .from("place_cache")
        .select("*")
        .eq("place_query", query)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
      HTTP_API_TIMEOUT_MS,
      `places:cache:${query.slice(0, 40)}`,
    );

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

    const searchRes = await fetchWithTimeout(
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
        label: `places:search:${rawQuery.slice(0, 40)}`,
      },
    );

    if (!searchRes.ok) {
      const text = await searchRes.text();
      console.error("Places searchText error:", searchRes.status, text.slice(0, 200));
      return empty;
    }

    let json: GoogleSearchResponse;
    try {
      json = (await searchRes.json()) as GoogleSearchResponse;
    } catch (err) {
      console.error("Places searchText JSON parse error:", err);
      return empty;
    }

    const place = json.places?.[0];
    if (!place) {
      await withTimeout(
        supabaseAdmin.from("place_cache").upsert(
          {
            place_query: query,
            not_found: true,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "place_query" },
        ),
        HTTP_API_TIMEOUT_MS,
        `places:cache-upsert-notfound:${query.slice(0, 40)}`,
      ).catch((err) => console.warn("places cache upsert failed:", err));
      return empty;
    }

    const countryCode =
      place.addressComponents?.find((c) => c.types?.includes("country"))?.shortText ?? null;

    let photoUrl: string | null = null;
    const photoUrls: string[] = [];
    const photoNames = (place.photos ?? [])
      .map((p) => p.name)
      .filter((n): n is string => Boolean(n))
      .slice(0, 3);

    for (const photoName of photoNames) {
      try {
        const mediaRes = await fetchWithTimeout(
          `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=800&maxWidthPx=1200&skipHttpRedirect=true`,
          {
            method: "GET",
            headers: { "X-Goog-Api-Key": apiKey },
            label: `places:media:${rawQuery.slice(0, 30)}`,
          },
        );
        if (!mediaRes.ok) continue;
        const media = (await mediaRes.json()) as GoogleMediaResponse;
        if (media.photoUri) photoUrls.push(media.photoUri);
      } catch (err) {
        console.warn("Places photo media skip:", rawQuery.slice(0, 40), err);
      }
    }
    photoUrl = photoUrls[0] ?? null;

    const info: PlaceInfo = {
      query: rawQuery,
      name: place.displayName?.text ?? null,
      placeId: place.id ?? null,
      photoUrl,
      photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
      formattedAddress: place.formattedAddress ?? null,
      countryCode,
    };

    await withTimeout(
      supabaseAdmin.from("place_cache").upsert(
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
      ),
      HTTP_API_TIMEOUT_MS,
      `places:cache-upsert:${query.slice(0, 40)}`,
    ).catch((err) => console.warn("places cache upsert failed:", err));

    return info;
  } catch (err) {
    console.error("Places lookup failed:", rawQuery.slice(0, 60), err);
    return empty;
  }
}

async function resolveOneSafe(rawQuery: string, apiKey: string): Promise<PlaceInfo> {
  try {
    return await withTimeout(
      resolveOne(rawQuery, apiKey),
      HTTP_API_TIMEOUT_MS,
      `places:resolveOne:${rawQuery.slice(0, 40)}`,
    );
  } catch (err) {
    console.warn("Places resolveOne timeout/fail:", rawQuery.slice(0, 60), err);
    return emptyPlaceInfo(rawQuery);
  }
}

/** Server-side batch lookup (used by plan enrichment + getPlacePhotos). */
export async function resolvePlacePhotosBatch(queries: string[]): Promise<PlaceInfo[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return queries.map((q) => emptyPlaceInfo(q));
  }

  const seen = new Map<string, string>();
  for (const q of queries) {
    const n = normalize(q);
    if (!seen.has(n)) seen.set(n, q);
  }

  const uniqueQueries = Array.from(seen.values());
  pipelineLog(
    "places:batch",
    `${uniqueQueries.length} unique / ${queries.length} total (concurrency ${PLACES_CONCURRENCY})`,
  );

  const results = await withTimeout(
    runWithConcurrency(uniqueQueries, PLACES_CONCURRENCY, (q) => resolveOneSafe(q, apiKey)),
    PLACES_BATCH_HARD_CAP_MS,
    "places:batch-all",
  ).catch((err) => {
    console.error("places:batch-all failed:", err);
    return uniqueQueries.map((q) => emptyPlaceInfo(q));
  });

  const byNorm = new Map(results.map((r) => [normalize(r.query), r]));

  return queries.map((q) => byNorm.get(normalize(q)) ?? emptyPlaceInfo(q));
}

export const getPlacePhoto = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SingleInput.parse(data))
  .handler(async ({ data }): Promise<{ place: PlaceInfo; error: string | null }> => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return { place: emptyPlaceInfo(data.query), error: "GOOGLE_PLACES_API_KEY ni nastavljen" };
    }
    const place = await resolveOneSafe(data.query, apiKey);
    return { place, error: null };
  });

export const getPlacePhotos = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BatchInput.parse(data))
  .handler(async ({ data }): Promise<{ places: PlaceInfo[]; error: string | null }> => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return {
        places: data.queries.map((q) => emptyPlaceInfo(q)),
        error: "GOOGLE_PLACES_API_KEY ni nastavljen",
      };
    }

    const places = await resolvePlacePhotosBatch(data.queries);
    return { places, error: null };
  });
