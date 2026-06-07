import {
  fetchWithTimeout,
  HTTP_API_TIMEOUT_MS,
  withTimeout,
} from "@/lib/asyncTimeout";

type UnsplashSearchResponse = {
  results?: Array<{ urls?: { regular?: string } }>;
};

/** Search Unsplash for location-specific photos (fallback when Google Places misses). */
export async function searchUnsplashPhotos(
  query: string,
  count = 3,
): Promise<string[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key || !query.trim()) return [];

  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query.trim().slice(0, 120));
    url.searchParams.set("per_page", String(Math.min(Math.max(count, 1), 10)));
    url.searchParams.set("orientation", "landscape");

    const res = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Client-ID ${key}` },
      label: `unsplash:${query.slice(0, 40)}`,
    });

    if (!res.ok) {
      console.warn("Unsplash search failed:", res.status, query.slice(0, 60));
      return [];
    }

    let json: UnsplashSearchResponse;
    try {
      json = (await withTimeout(
        res.json() as Promise<UnsplashSearchResponse>,
        HTTP_API_TIMEOUT_MS,
        `unsplash:json:${query.slice(0, 40)}`,
      )) as UnsplashSearchResponse;
    } catch (err) {
      console.warn("Unsplash JSON parse/timeout:", query.slice(0, 60), err);
      return [];
    }

    const urls =
      json.results
        ?.map((r) => r.urls?.regular)
        .filter((u): u is string => Boolean(u)) ?? [];
    return urls.slice(0, count);
  } catch (err) {
    console.warn("Unsplash search error:", query.slice(0, 60), err);
    return [];
  }
}
