import { useCallback, useEffect, useState } from "react";

export const HERO_PHOTO_QUERY = "travel destination landscape";
export const HERO_PHOTO_FALLBACK =
  "https://images.unsplash.com/photo-1478088913771-e3a36f50bb63?w=1600";

type HeroPhotoState = {
  url: string;
  query: string;
  photographer?: string;
  loading: boolean;
};

export function useHeroPhoto() {
  const [photo, setPhoto] = useState<HeroPhotoState>({
    url: HERO_PHOTO_FALLBACK,
    query: HERO_PHOTO_QUERY,
    loading: true,
  });

  const load = useCallback(async () => {
    setPhoto((prev) => ({ ...prev, loading: true }));
    try {
      const params = new URLSearchParams({
        query: HERO_PHOTO_QUERY,
        seed: String(Math.floor(Math.random() * 10_000)),
      });
      const res = await fetch(`/api/hero-photo?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        url?: string | null;
        query?: string;
        photographer?: string;
      };
      const nextUrl = data.url?.trim() || HERO_PHOTO_FALLBACK;
      setPhoto({
        url: nextUrl,
        query: data.query ?? HERO_PHOTO_QUERY,
        photographer: data.photographer,
        loading: false,
      });
    } catch {
      setPhoto((prev) => ({
        ...prev,
        url: HERO_PHOTO_FALLBACK,
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return photo;
}
