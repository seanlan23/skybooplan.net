import { fetchWithTimeout } from "@/lib/asyncTimeout";

const UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos";

/** Landscape hero backgrounds — Slovenia, beaches, cities. */
export const HERO_TRAVEL_QUERIES = [
  "lake bled slovenia travel",
  "piran slovenia adriatic coast",
  "thailand tropical beach travel",
  "new york city skyline travel",
  "paris eiffel tower daylight travel",
  "bali rice terrace travel",
  "julian alps slovenia mountains",
  "tropical beach paradise travel",
] as const;

type UnsplashSearchResponse = {
  results?: Array<{
    urls?: { regular?: string; full?: string };
    user?: { name?: string; links?: { html?: string } };
    links?: { html?: string };
  }>;
};

export type HeroPhotoResult = {
  url: string | null;
  query: string;
  photographer?: string;
  photoPage?: string;
};

export function pickHeroQuery(seed?: number): string {
  const pool = HERO_TRAVEL_QUERIES;
  if (seed == null) {
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
  return pool[Math.abs(seed) % pool.length]!;
}

export async function fetchHeroPhoto(
  query?: string,
  options?: { pageSeed?: number },
): Promise<HeroPhotoResult> {
  const q = query?.trim() || pickHeroQuery();
  const accessKey = process.env.UNSPLASH_ACCESS_KEY?.trim();
  if (!accessKey) {
    return { url: null, query: q };
  }

  const page =
    options?.pageSeed != null
      ? (Math.abs(Math.floor(options.pageSeed)) % 15) + 1
      : 1;

  const params = new URLSearchParams({
    query: q,
    per_page: "1",
    page: String(page),
    orientation: "landscape",
  });

  try {
    const res = await fetchWithTimeout(`${UNSPLASH_SEARCH_URL}?${params}`, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        "Accept-Version": "v1",
      },
      timeoutMs: 4_000,
      label: `hero-photo:${q.slice(0, 32)}`,
    });

    if (!res.ok) {
      return { url: null, query: q };
    }

    const data = (await res.json()) as UnsplashSearchResponse;
    const hit = data.results?.[0];
    const url = hit?.urls?.regular?.trim() || hit?.urls?.full?.trim() || null;
    if (!url || !/^https?:\/\//i.test(url)) {
      return { url: null, query: q };
    }

    return {
      url,
      query: q,
      photographer: hit?.user?.name,
      photoPage: hit?.links?.html,
    };
  } catch {
    return { url: null, query: q };
  }
}
