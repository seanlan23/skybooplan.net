/**
 * Daytime Slovenia hero backgrounds (Unsplash, no API key).
 * Lake Bled, Piran, Julian Alps, Ljubljana — avoid dark night shots.
 */
export const HERO_ROTATING_BACKGROUNDS = [
  "https://images.unsplash.com/photo-1478088913771-e3a36f50bb63", // Lake Bled + Julian Alps
  "https://images.unsplash.com/photo-1520900828798-002c1800f31a", // Piran Adriatic coast
  "https://images.unsplash.com/photo-1712385645491-c334e4caf013", // Bled Island church
  "https://images.unsplash.com/photo-1605649487212-47bdab064df7", // Julian Alps peaks
  "https://images.unsplash.com/photo-1578386269334-4e912b9cdbc8", // Ljubljana Castle
  "https://images.unsplash.com/photo-1740978197848-d526dfd5af05", // Lake Bled elevated view
  "https://images.unsplash.com/photo-1505159940484-eb2b9f2588e2", // Bled boat on the lake
] as const;

/** How long each slide stays fully visible before crossfade. */
export const HERO_BACKGROUND_ROTATE_MS = 12_000;

/** Soft crossfade — longer feels calmer on bright photos. */
export const HERO_BACKGROUND_FADE_MS = 2_800;

export function heroBackgroundImageUrl(baseUrl: string): string {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}auto=format&fit=crop&w=2400&q=82`;
}
