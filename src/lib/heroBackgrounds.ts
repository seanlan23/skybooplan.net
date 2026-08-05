/**
 * Daytime travel hero backgrounds (Unsplash, no API key).
 * Mix: Slovenia + beaches + cities — avoid dark night/mood shots.
 */
export const HERO_ROTATING_BACKGROUNDS = [
  // Slovenia
  "https://images.unsplash.com/photo-1478088913771-e3a36f50bb63", // Lake Bled + Julian Alps
  "https://images.unsplash.com/photo-1520900828798-002c1800f31a", // Piran Adriatic
  // Tropical / Thailand-style beaches
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e", // turquoise shore
  "https://images.unsplash.com/photo-1559827260-dc66d52bef19", // aerial lagoon
  "https://images.unsplash.com/photo-1519046904884-53103b34b206", // sunny beach day
  // Cities
  "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9", // New York skyline
  "https://images.unsplash.com/photo-1499856871958-5b9627545d1a", // Paris daylight
  "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1", // Bali
] as const;

/** How long each slide stays fully visible before crossfade. */
export const HERO_BACKGROUND_ROTATE_MS = 12_000;

/** Soft crossfade — longer feels calmer on bright photos. */
export const HERO_BACKGROUND_FADE_MS = 2_800;

export function heroBackgroundImageUrl(baseUrl: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}auto=format&fit=crop&w=2400&q=82`;
}
