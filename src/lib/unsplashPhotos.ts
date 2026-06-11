import type { AiTripPlan } from "@/lib/aiPlan.functions";

const UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos";

type UnsplashSearchResponse = {
  results?: Array<{
    urls?: {
      small?: string;
      regular?: string;
    };
  }>;
};

/** Search queries in priority order — first hit wins. */
export function buildUnsplashSearchQueries(poiName: string, cityName: string): string[] {
  const poi = poiName.trim();
  const city = cityName.trim();
  const queries: string[] = [];
  if (poi && city) queries.push(`${poi} ${city}`);
  if (city) {
    queries.push(`${city} travel`);
    queries.push(city);
  }
  return [...new Set(queries)];
}

function pickPhotoUrl(data: UnsplashSearchResponse): string | null {
  const urls = data.results?.[0]?.urls;
  const url = urls?.small?.trim() || urls?.regular?.trim();
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/** Always request exactly one result from Unsplash. */
async function searchUnsplashOnce(query: string, accessKey: string): Promise<string | null> {
  const params = new URLSearchParams({
    query,
    per_page: "1",
    orientation: "squarish",
  });
  const res = await fetch(`${UNSPLASH_SEARCH_URL}?${params}`, {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      "Accept-Version": "v1",
    },
  });
  if (!res.ok) {
    console.warn(`[unsplash] search failed ${res.status} for "${query}"`);
    return null;
  }
  const data = (await res.json()) as UnsplashSearchResponse;
  return pickPhotoUrl(data);
}

/**
 * Fetch exactly one POI photo from Unsplash Search API (per_page=1).
 * Falls back: poi+city → city travel → city only.
 */
export async function fetchUnsplashPhoto(
  poiName: string,
  cityName: string,
): Promise<string | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey) {
    return null;
  }

  for (const query of buildUnsplashSearchQueries(poiName, cityName)) {
    const url = await searchUnsplashOnce(query, accessKey);
    if (url) return url;
  }
  return null;
}

/** One hero photo per city/location (city-only search). */
export async function fetchUnsplashCityPhoto(cityName: string): Promise<string | null> {
  return fetchUnsplashPhoto("", cityName);
}

export function normalizeImageUrl(url?: string): string | undefined {
  const trimmed = url?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : undefined;
}

function shouldFetchPoiPhoto(category?: string): boolean {
  const c = (category ?? "").toLowerCase();
  return c !== "airport" && c !== "hotel";
}

type FetchJob = {
  key: string;
  poiName: string;
  city: string;
  isCity: boolean;
  needsFetch: boolean;
};

function dayCity(day: AiTripPlan["days"][number]): string {
  return (day.city ?? day.focusName ?? "").trim();
}

/**
 * Enrich plan with exactly one imageUrl per city and per POI/activity.
 * Only writes imageUrl string — never arrays.
 */
export async function enrichPlanPoiPhotos(plan: AiTripPlan): Promise<void> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey) {
    console.warn("[unsplash] UNSPLASH_ACCESS_KEY not configured — skipping POI photos");
    return;
  }

  const jobs = new Map<string, FetchJob>();

  for (const day of plan.days) {
    const city = dayCity(day);
    if (!city) continue;

    const locKey = `loc:${city.toLowerCase()}`;
    if (!jobs.has(locKey)) {
      const hasCityPhoto = plan.days.some(
        (d) => dayCity(d) === city && Boolean(d.imageUrl?.trim()),
      );
      jobs.set(locKey, {
        key: locKey,
        poiName: "",
        city,
        isCity: true,
        needsFetch: !hasCityPhoto,
      });
    }

    for (const pin of day.mapPins ?? []) {
      if (!shouldFetchPoiPhoto(pin.category)) continue;
      const poiKey = `poi:${pin.name.trim().toLowerCase()}|${city.toLowerCase()}`;
      if (!jobs.has(poiKey)) {
        jobs.set(poiKey, {
          key: poiKey,
          poiName: pin.name,
          city,
          isCity: false,
          needsFetch: !pin.imageUrl?.trim(),
        });
      }
    }

    const slots = day.activities;
    if (slots) {
      for (const act of [
        ...(slots.morning ?? []),
        ...(slots.afternoon ?? []),
        ...(slots.evening ?? []),
      ]) {
        const poiKey = `poi:${act.name.trim().toLowerCase()}|${city.toLowerCase()}`;
        const existing = jobs.get(poiKey);
        if (existing) {
          if (act.imageUrl?.trim()) existing.needsFetch = false;
          continue;
        }
        jobs.set(poiKey, {
          key: poiKey,
          poiName: act.name,
          city,
          isCity: false,
          needsFetch: !act.imageUrl?.trim(),
        });
      }
    }
  }

  const pending = [...jobs.values()].filter((j) => j.needsFetch);
  if (pending.length === 0) return;

  const cache = new Map<string, string | null>();
  const resolveJob = async (job: FetchJob): Promise<string | null> => {
    if (cache.has(job.key)) return cache.get(job.key) ?? null;
    const url = job.isCity
      ? await fetchUnsplashCityPhoto(job.city)
      : await fetchUnsplashPhoto(job.poiName, job.city);
    cache.set(job.key, url);
    return url;
  };

  const concurrency = 4;
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
      while (index < pending.length) {
        const job = pending[index++]!;
        await resolveJob(job);
      }
    }),
  );

  for (const [key, url] of cache.entries()) {
    if (!url) continue;
    if (key.startsWith("loc:")) {
      const city = key.slice(4);
      for (const day of plan.days) {
        if (dayCity(day).toLowerCase() === city) {
          day.imageUrl = url;
        }
      }
      continue;
    }

    const [, poiAndCity] = key.split(":", 2);
    const [poiName, cityKey] = poiAndCity?.split("|") ?? [];
    if (!poiName || !cityKey) continue;

    for (const day of plan.days) {
      if (dayCity(day).toLowerCase() !== cityKey) continue;
      for (const pin of day.mapPins ?? []) {
        if (pin.name.trim().toLowerCase() === poiName) pin.imageUrl = url;
      }
      const slots = day.activities;
      if (!slots) continue;
      for (const act of [
        ...(slots.morning ?? []),
        ...(slots.afternoon ?? []),
        ...(slots.evening ?? []),
      ]) {
        if (act.name.trim().toLowerCase() === poiName) act.imageUrl = url;
      }
    }
  }

  for (const day of plan.days) {
    day.imageUrl = normalizeImageUrl(day.imageUrl);
    for (const pin of day.mapPins ?? []) {
      pin.imageUrl = normalizeImageUrl(pin.imageUrl);
    }
    const slots = day.activities;
    if (!slots) continue;
    for (const act of [
      ...(slots.morning ?? []),
      ...(slots.afternoon ?? []),
      ...(slots.evening ?? []),
    ]) {
      act.imageUrl = normalizeImageUrl(act.imageUrl);
    }
  }
}
