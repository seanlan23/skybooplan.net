/** Curated Unsplash hero backgrounds — direct URLs, no API key required. */
export const HERO_ROTATING_BACKGROUNDS = [
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4",
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e",
  "https://images.unsplash.com/photo-1488646953014-85cb44e25828",
  "https://images.unsplash.com/photo-1524492412937-b28074a5d7da",
  "https://images.unsplash.com/photo-1528360983277-13d401cdc186",
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e",
] as const;

export const HERO_BACKGROUND_ROTATE_MS = 5_000;
export const HERO_BACKGROUND_FADE_MS = 1_500;

export function heroBackgroundImageUrl(baseUrl: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}auto=format&fit=crop&w=1920&q=80`;
}
