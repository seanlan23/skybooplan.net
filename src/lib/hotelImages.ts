/** Cap hotel card galleries so cards stay light. */
export const MAX_HOTEL_GALLERY_IMAGES = 6;

function asImageUrl(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const rec = raw as { url?: unknown; src?: unknown };
    if (typeof rec.url === "string") return rec.url.trim();
    if (typeof rec.src === "string") return rec.src.trim();
  }
  return "";
}

export function uniqueHotelImageUrls(
  urls: Array<unknown>,
  max = MAX_HOTEL_GALLERY_IMAGES,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    let url = asImageUrl(raw);
    if (!url) continue;
    if (url.startsWith("//")) url = `https:${url}`;
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

/** Prefer live hotel photos; fall back to a cover, then generic resort shots. */
export function packageGalleryImages(opts: {
  images?: string[];
  coverImageUrl?: string;
  fallbacks?: readonly string[];
}): string[] {
  const fromHotel = uniqueHotelImageUrls([...(opts.images ?? []), opts.coverImageUrl]);
  if (fromHotel.length) return fromHotel;
  return uniqueHotelImageUrls([...(opts.fallbacks ?? [])]);
}
