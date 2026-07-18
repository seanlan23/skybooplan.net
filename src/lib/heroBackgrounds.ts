/**
 * Bright daytime travel hero backgrounds (Unsplash, no API key).
 * Mix of paradise beaches + sunny cityscapes — avoid dark night/mood shots.
 */
export const HERO_ROTATING_BACKGROUNDS = [
  // Tropical beaches
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e", // turquoise shore
  "https://images.unsplash.com/photo-1559827260-dc66d52bef19", // aerial lagoon
  "https://images.unsplash.com/photo-1519046904884-53103b34b206", // sunny beach day
  "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a", // palms + sand
  "https://images.unsplash.com/photo-1500375592092-40eb2168fd21", // bright waterfall coast
  // Sunny cities
  "https://images.unsplash.com/photo-1499856871958-5b9627545d1a", // Paris daylight
  "https://images.unsplash.com/photo-1539037116277-4db20889f2d4", // Barcelona
  "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9", // Venice canals
] as const;

/** How long each slide stays fully visible before crossfade. */
export const HERO_BACKGROUND_ROTATE_MS = 12_000;

/** Soft crossfade — longer feels calmer on bright photos. */
export const HERO_BACKGROUND_FADE_MS = 2_800;

export function heroBackgroundImageUrl(baseUrl: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}auto=format&fit=crop&w=2400&q=82`;
}
