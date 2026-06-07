import type { AiTripPlan } from "@/lib/aiPlan.functions";
import type { TripPlanResponse } from "@/lib/geminiPro.shared";
import {
  HTTP_API_TIMEOUT_MS,
  pipelineLog,
  runWithConcurrency,
  withTimeout,
} from "@/lib/asyncTimeout";
import { resolvePlacePhotosBatch } from "@/lib/placePhotos.functions";
import { searchUnsplashPhotos } from "@/lib/unsplashPhotos";

const PHOTO_BATCH_SIZE = 15;
const UNSPLASH_CONCURRENCY = 3;
const MAX_UNSplash_FALLBACKS = 25;

type PhotoSlot = {
  query: string;
  apply: (primary: string, extras?: string[]) => void;
};

function buildPhotoQuery(parts: Array<string | undefined | null>): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

/** Prefer Gemini `imageSearchQuery`; fallback to name + city + destination. */
export function resolvePoiImageSearchQuery(input: {
  imageSearchQuery?: string | null;
  name: string;
  city?: string;
  destinationLabel?: string;
}): string {
  const fromAi = input.imageSearchQuery?.trim();
  if (fromAi) return fromAi.slice(0, 200);
  return buildPhotoQuery([input.name, input.city, input.destinationLabel]);
}

/**
 * Fetch Google Places (then Unsplash fallback) photos for cities, POIs, and
 * activities on the raw Gemini response before it is mapped to the catalog plan.
 */
export async function enrichTripPlanResponsePhotos(
  plan: TripPlanResponse,
  destinationLabel: string,
): Promise<void> {
  const slots: PhotoSlot[] = [];

  for (const phase of plan.itinerar ?? []) {
    const city = phase.city.trim();
    if (!city) continue;

    slots.push({
      query: buildPhotoQuery([city, destinationLabel]),
      apply: (url, extras) => {
        phase.imageUrl = url;
        if (extras?.length) phase.imageUrls = extras;
      },
    });

    for (const poi of phase.pois ?? []) {
      slots.push({
        query: resolvePoiImageSearchQuery({
          imageSearchQuery: poi.imageSearchQuery,
          name: poi.name,
          city,
          destinationLabel,
        }),
        apply: (url, extras) => {
          poi.imageUrl = url;
          if (extras?.length) poi.imageUrls = extras;
        },
      });
    }

    for (const day of phase.days ?? []) {
      for (const act of day.activities ?? []) {
        slots.push({
          query: resolvePoiImageSearchQuery({
            imageSearchQuery: act.imageSearchQuery,
            name: act.title,
            city,
            destinationLabel,
          }),
          apply: (url, extras) => {
            act.imageUrl = url;
            if (extras?.length) act.imageUrls = extras;
          },
        });
      }
    }
  }

  if (slots.length === 0) {
    pipelineLog("photos:enrich", "no slots — skip");
    return;
  }

  const uniqueQueries: string[] = [];
  const normToUnique = new Map<string, number>();
  const slotUniqueIdx: number[] = [];

  for (const slot of slots) {
    const norm = slot.query.toLowerCase();
    let idx = normToUnique.get(norm);
    if (idx === undefined) {
      idx = uniqueQueries.length;
      normToUnique.set(norm, idx);
      uniqueQueries.push(slot.query);
    }
    slotUniqueIdx.push(idx);
  }

  pipelineLog("photos:enrich", `${slots.length} slots → ${uniqueQueries.length} unique queries`);

  const photosByUniqueIdx: Array<string[] | null> = new Array(uniqueQueries.length).fill(null);

  const chunks: string[][] = [];
  for (let i = 0; i < uniqueQueries.length; i += PHOTO_BATCH_SIZE) {
    chunks.push(uniqueQueries.slice(i, i + PHOTO_BATCH_SIZE));
  }

  // Sequential chunks — avoids parallel stampedes across many batches.
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex]!;
    const baseIdx = chunkIndex * PHOTO_BATCH_SIZE;
    pipelineLog(`photos:google chunk ${chunkIndex + 1}/${chunks.length}`, `${chunk.length} queries`);

    try {
      const results = await withTimeout(
        resolvePlacePhotosBatch(chunk),
        HTTP_API_TIMEOUT_MS * 3,
        `photos:google-chunk-${chunkIndex + 1}`,
      );
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const urls = r?.photoUrls?.length
          ? r.photoUrls
          : r?.photoUrl
            ? [r.photoUrl]
            : null;
        if (urls?.length) photosByUniqueIdx[baseIdx + j] = urls;
      }
    } catch (err) {
      console.warn(`photos:google chunk ${chunkIndex + 1} failed:`, err);
    }
  }

  const missingIndices = uniqueQueries
    .map((query, idx) => ({ query, idx }))
    .filter(({ idx }) => !photosByUniqueIdx[idx]?.length)
    .slice(0, MAX_UNSplash_FALLBACKS);

  if (missingIndices.length > 0) {
    pipelineLog(
      "photos:unsplash fallback",
      `${missingIndices.length} queries (cap ${MAX_UNSplash_FALLBACKS})`,
    );
    await runWithConcurrency(missingIndices, UNSPLASH_CONCURRENCY, async ({ query, idx }) => {
      try {
        console.log("[tripPlanPhotos] unsplash query:", query);
        const unsplash = await withTimeout(
          searchUnsplashPhotos(query, 3),
          HTTP_API_TIMEOUT_MS,
          `photos:unsplash:${query.slice(0, 40)}`,
        );
        if (unsplash.length > 0) photosByUniqueIdx[idx] = unsplash;
      } catch (err) {
        console.warn("photos:unsplash skip:", query.slice(0, 50), err);
      }
    });
  }

  let applied = 0;
  for (let i = 0; i < slots.length; i++) {
    const urls = photosByUniqueIdx[slotUniqueIdx[i]!];
    if (urls?.[0]) {
      slots[i]!.apply(urls[0], urls.slice(0, 3));
      applied += 1;
    }
  }
  pipelineLog("photos:enrich done", `${applied}/${slots.length} slots got URLs`);
}

/** Propagate phase/activity photos onto catalog days after mapping. */
export async function enrichTripPlanCityPhotos(plan: AiTripPlan): Promise<void> {
  const cityQueries = new Map<string, string>();

  for (const d of plan.days) {
    if (d.imageUrl) continue;
    const city = (d.city ?? "").trim();
    if (!city) continue;
    const key = city.toLowerCase();
    if (cityQueries.has(key)) continue;
    const dest = (plan.destinationName ?? "").trim();
    cityQueries.set(key, dest ? `${city}, ${dest}` : city);
  }

  if (cityQueries.size === 0) return;

  pipelineLog("photos:city", `${cityQueries.size} cities`);

  let results: Awaited<ReturnType<typeof resolvePlacePhotosBatch>> = [];
  try {
    results = await withTimeout(
      resolvePlacePhotosBatch(Array.from(cityQueries.values())),
      HTTP_API_TIMEOUT_MS * 2,
      "photos:city-google",
    );
  } catch (err) {
    console.warn("photos:city-google failed:", err);
  }

  const urlByCity = new Map<string, string>();
  let i = 0;
  for (const cityLower of cityQueries.keys()) {
    const r = results[i];
    const url = r?.photoUrls?.[0] ?? r?.photoUrl;
    if (url) urlByCity.set(cityLower, url);
    i += 1;
  }

  for (const [cityLower, query] of cityQueries.entries()) {
    if (urlByCity.has(cityLower)) continue;
      try {
        console.log("[tripPlanPhotos] unsplash query (city fallback):", query);
        const unsplash = await withTimeout(
        searchUnsplashPhotos(query, 1),
        HTTP_API_TIMEOUT_MS,
        `photos:city-unsplash:${cityLower}`,
      );
      if (unsplash[0]) urlByCity.set(cityLower, unsplash[0]);
    } catch (err) {
      console.warn("photos:city-unsplash skip:", cityLower, err);
    }
  }

  for (const d of plan.days) {
    if (d.imageUrl) continue;
    const key = (d.city ?? "").trim().toLowerCase();
    const url = urlByCity.get(key);
    if (url) d.imageUrl = url;
  }
}

/** Copy activity-level imageUrl from structured activities onto map pins if missing. */
export function syncActivityPhotosToMapPins(plan: AiTripPlan): void {
  for (const day of plan.days) {
    const slots = ["morning", "afternoon", "evening"] as const;
    const imageByName = new Map<string, { url: string; urls?: string[] }>();
    for (const slot of slots) {
      for (const act of day.activities?.[slot] ?? []) {
        if (act.imageUrl) {
          imageByName.set(act.name.trim().toLowerCase(), {
            url: act.imageUrl,
            urls: act.imageUrls,
          });
        }
      }
    }
    if (!day.mapPins?.length) continue;
    for (const pin of day.mapPins) {
      const hit = imageByName.get(pin.name.trim().toLowerCase());
      if (!hit) continue;
      if (!pin.imageUrl) pin.imageUrl = hit.url;
      if (!pin.imageUrls?.length && hit.urls?.length) pin.imageUrls = hit.urls;
    }
  }
}
