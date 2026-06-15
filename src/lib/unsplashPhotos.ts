import type { Activity, AiTripPlan } from "@/lib/aiPlan.functions";
import { fetchWithTimeout, withTimeout } from "@/lib/asyncTimeout";

const UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos";

/** Hard cap per Unsplash lookup — skip image on timeout instead of blocking the plan. */
export const UNSPLASH_REQUEST_TIMEOUT_MS = 2_000;

type UnsplashSearchResponse = {
  results?: Array<{
    urls?: {
      small?: string;
      regular?: string;
    };
  }>;
};

/** Legacy fallback when Gemini omits unsplashQuery (older plans). */
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
  const trimmed = query.trim();
  if (!trimmed) return null;

  console.log("Unsplash klic za:", trimmed);

  const params = new URLSearchParams({
    query: trimmed,
    per_page: "1",
    orientation: "squarish",
  });
  try {
    const res = await fetchWithTimeout(`${UNSPLASH_SEARCH_URL}?${params}`, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      timeoutMs: UNSPLASH_REQUEST_TIMEOUT_MS,
      label: `unsplash:${trimmed.slice(0, 48)}`,
    });
    if (!res.ok) {
      console.warn(`[unsplash] search failed ${res.status} for "${trimmed}"`);
      console.log("Unsplash vrnil URL:", null);
      return null;
    }
    const data = (await res.json()) as UnsplashSearchResponse;
    const url = pickPhotoUrl(data);
    console.log("Unsplash vrnil URL:", data.results?.[0]?.urls?.small ?? url ?? null);
    return url;
  } catch (err) {
    console.warn(`[unsplash] search error for "${trimmed}":`, err);
    console.log("Unsplash vrnil URL:", null);
    return null;
  }
}

/**
 * Fetch one photo using Gemini's English unsplashQuery (primary path).
 */
export async function fetchUnsplashByQuery(query: string): Promise<string | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey) {
    return null;
  }

  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    return await withTimeout(
      searchUnsplashOnce(trimmed, accessKey),
      UNSPLASH_REQUEST_TIMEOUT_MS,
      "unsplash-query",
    );
  } catch {
    return null;
  }
}

/**
 * @deprecated Prefer fetchUnsplashByQuery with Gemini unsplashQuery.
 * Legacy fallback using Slovenian/local names.
 */
export async function fetchUnsplashPhoto(
  poiName: string,
  cityName: string,
): Promise<string | null> {
  const queries = buildUnsplashSearchQueries(poiName, cityName);
  const primary = queries[0];
  if (!primary) return null;
  return fetchUnsplashByQuery(primary);
}

/** One hero photo per city/location. */
export async function fetchUnsplashCityPhoto(cityQuery: string): Promise<string | null> {
  return fetchUnsplashByQuery(cityQuery);
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
  unsplashQuery: string;
  isCity: boolean;
  needsFetch: boolean;
};

function dayCity(day: AiTripPlan["days"][number]): string {
  return (day.city ?? day.focusName ?? "").trim();
}

function resolveCityUnsplashQuery(day: AiTripPlan["days"][number]): string {
  return (
    day.unsplashQuery?.trim() ||
    buildUnsplashSearchQueries("", dayCity(day))[0] ||
    dayCity(day)
  );
}

function resolvePoiUnsplashQuery(
  unsplashQuery: string | undefined,
  name: string,
  city: string,
): string {
  return (
    unsplashQuery?.trim() ||
    buildUnsplashSearchQueries(name, city)[0] ||
    ""
  );
}

function collectFetchJobs(plan: AiTripPlan): Map<string, FetchJob> {
  const jobs = new Map<string, FetchJob>();

  for (const day of plan.days) {
    const city = dayCity(day);
    if (!city) continue;

    const locKey = `loc:${city.toLowerCase()}`;
    if (!jobs.has(locKey)) {
      const hasCityPhoto = plan.days.some(
        (d) => dayCity(d) === city && Boolean(d.imageUrl?.trim()),
      );
      const unsplashQuery = resolveCityUnsplashQuery(day);
      jobs.set(locKey, {
        key: locKey,
        unsplashQuery,
        isCity: true,
        needsFetch: !hasCityPhoto && Boolean(unsplashQuery),
      });
    }

    for (const pin of day.mapPins ?? []) {
      if (!shouldFetchPoiPhoto(pin.category)) continue;
      const poiKey = `poi:${pin.name.trim().toLowerCase()}|${city.toLowerCase()}`;
      const unsplashQuery = resolvePoiUnsplashQuery(pin.unsplashQuery, pin.name, city);
      if (!jobs.has(poiKey)) {
        jobs.set(poiKey, {
          key: poiKey,
          unsplashQuery,
          isCity: false,
          needsFetch: !pin.imageUrl?.trim() && Boolean(unsplashQuery),
        });
      } else if (pin.imageUrl?.trim()) {
        const existing = jobs.get(poiKey)!;
        existing.needsFetch = false;
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
        const unsplashQuery = resolvePoiUnsplashQuery(act.unsplashQuery, act.name, city);
        const existing = jobs.get(poiKey);
        if (existing) {
          if (act.imageUrl?.trim()) existing.needsFetch = false;
          if (!existing.unsplashQuery && unsplashQuery) existing.unsplashQuery = unsplashQuery;
          continue;
        }
        jobs.set(poiKey, {
          key: poiKey,
          unsplashQuery,
          isCity: false,
          needsFetch: !act.imageUrl?.trim() && Boolean(unsplashQuery),
        });
      }
    }
  }

  return jobs;
}

function applyPhotoCache(plan: AiTripPlan, cache: Map<string, string | null>): void {
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

/**
 * Enrich plan with exactly one imageUrl per city and per POI/activity.
 * Uses Gemini unsplashQuery (English) for Unsplash Search API.
 */
export async function enrichPlanPoiPhotos(plan: AiTripPlan): Promise<void> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey) {
    console.warn("[unsplash] UNSPLASH_ACCESS_KEY not configured — skipping POI photos");
    return;
  }

  const pending = [...collectFetchJobs(plan).values()].filter((j) => j.needsFetch);
  if (pending.length === 0) {
    console.log("[unsplash] no pending photo jobs");
    return;
  }

  console.log(`[unsplash] fetching ${pending.length} photos (batched)`);

  const cache = new Map<string, string | null>();
  const concurrency = 4;

  for (let i = 0; i < pending.length; i += concurrency) {
    const batch = pending.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (job) => {
        if (cache.has(job.key)) return;
        const url = await fetchUnsplashByQuery(job.unsplashQuery);
        cache.set(job.key, url);
      }),
    );
  }

  const hitCount = [...cache.values()].filter(Boolean).length;
  console.log(`[unsplash] resolved ${hitCount}/${pending.length} photos`);

  applyPhotoCache(plan, cache);
}

/** Stable key for deciding whether background photo enrichment is needed. */
export function buildPlanPhotoRequestKey(plan: AiTripPlan): string {
  return plan.days
    .map((d) => {
      const city = dayCity(d);
      const pins = (d.mapPins ?? [])
        .filter((p) => shouldFetchPoiPhoto(p.category))
        .map((p) => `${p.name}:${p.unsplashQuery ?? ""}:${p.imageUrl ?? ""}`)
        .join(",");
      const acts = d.activities
        ? [...d.activities.morning, ...d.activities.afternoon, ...d.activities.evening]
            .map((a) => `${a.name}:${a.unsplashQuery ?? ""}:${a.imageUrl ?? ""}`)
            .join(",")
        : "";
      return `${d.day}:${city}:${d.unsplashQuery ?? ""}:${d.imageUrl ?? ""}:${pins}:${acts}`;
    })
    .join("|");
}

export function planNeedsPhotoEnrichment(plan: AiTripPlan): boolean {
  for (const day of plan.days) {
    const city = dayCity(day);
    if (city && !day.imageUrl?.trim()) return true;
    for (const pin of day.mapPins ?? []) {
      if (shouldFetchPoiPhoto(pin.category) && !pin.imageUrl?.trim()) return true;
    }
    const slots = day.activities;
    if (!slots) continue;
    for (const act of [...slots.morning, ...slots.afternoon, ...slots.evening]) {
      if (!act.imageUrl?.trim()) return true;
    }
  }
  return false;
}

function mergeActivityPhotos(target: Activity, source?: Activity): Activity {
  if (!source?.imageUrl?.trim() || target.imageUrl?.trim()) return target;
  return { ...target, imageUrl: source.imageUrl };
}

/** Merge imageUrl fields from an enriched plan clone into the displayed plan. */
export function mergePlanPhotos(base: AiTripPlan, enriched: AiTripPlan): AiTripPlan {
  const enrichedByDay = new Map(enriched.days.map((d) => [d.day, d]));

  return {
    ...base,
    days: base.days.map((day) => {
      const src = enrichedByDay.get(day.day);
      if (!src) return day;

      const srcPinByName = new Map(
        (src.mapPins ?? []).map((p) => [p.name.trim().toLowerCase(), p]),
      );

      const mapPins = day.mapPins?.map((pin) => {
        const hit = srcPinByName.get(pin.name.trim().toLowerCase());
        if (!hit?.imageUrl?.trim() || pin.imageUrl?.trim()) return pin;
        return { ...pin, imageUrl: hit.imageUrl };
      });

      let activities = day.activities;
      if (activities && src.activities) {
        const srcAct = (name: string) => {
          const key = name.trim().toLowerCase();
          return [...src.activities!.morning, ...src.activities!.afternoon, ...src.activities!.evening].find(
            (a) => a.name.trim().toLowerCase() === key,
          );
        };
        activities = {
          morning: activities.morning.map((a) => mergeActivityPhotos(a, srcAct(a.name))),
          afternoon: activities.afternoon.map((a) => mergeActivityPhotos(a, srcAct(a.name))),
          evening: activities.evening.map((a) => mergeActivityPhotos(a, srcAct(a.name))),
        };
      }

      return {
        ...day,
        imageUrl: day.imageUrl?.trim() ? day.imageUrl : src.imageUrl,
        mapPins,
        activities,
      };
    }),
  };
}
