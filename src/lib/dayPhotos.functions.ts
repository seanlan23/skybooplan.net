import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { pipelineLog, withTimeout, HTTP_API_TIMEOUT_MS } from "@/lib/asyncTimeout";
import { resolvePlacePhotosBatch } from "@/lib/placePhotos.functions";
import { searchUnsplashPhotos } from "@/lib/unsplashPhotos";
import { resolvePoiImageSearchQuery } from "@/lib/tripPlanPhotos";

const namedItem = z.object({
  name: z.string().min(1),
  imageSearchQuery: z.string().min(1).max(220).optional(),
});

const fetchPhotosForDayInput = z.object({
  dayNumber: z.number().int().min(1),
  destinationName: z.string().min(1),
  city: z.string().min(1),
  focusName: z.string().optional(),
  activities: z.array(namedItem).max(24),
  mapPins: z.array(namedItem).max(24).optional(),
});

export type FetchPhotosForDayInput = z.infer<typeof fetchPhotosForDayInput>;

export type DayPhotoItem = {
  name: string;
  imageUrl?: string;
  imageUrls?: string[];
};

export type FetchPhotosForDayResult = {
  dayNumber: number;
  heroImageUrl?: string;
  heroImageUrls?: string[];
  items: DayPhotoItem[];
};

function buildQuery(parts: Array<string | undefined | null>): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

async function resolveQueryPhotos(query: string): Promise<string[]> {
  try {
    const [google] = await withTimeout(
      resolvePlacePhotosBatch([query]),
      HTTP_API_TIMEOUT_MS,
      `dayPhotos:google:${query.slice(0, 40)}`,
    );
    const urls = google?.photoUrls?.length
      ? google.photoUrls
      : google?.photoUrl
        ? [google.photoUrl]
        : [];
    if (urls.length > 0) return urls.slice(0, 3);
  } catch (err) {
    console.warn("dayPhotos:google skip:", query.slice(0, 50), err);
  }

  try {
    console.log("[tripPlanPhotos] unsplash query:", query);
    const unsplash = await withTimeout(
      searchUnsplashPhotos(query, 3),
      HTTP_API_TIMEOUT_MS,
      `dayPhotos:unsplash:${query.slice(0, 40)}`,
    );
    return unsplash.slice(0, 3);
  } catch (err) {
    console.warn("dayPhotos:unsplash skip:", query.slice(0, 50), err);
    return [];
  }
}

/** Fetch hero + activity/POI photos for a single itinerary day (client lazy-load). */
export async function fetchPhotosForDayCore(
  input: FetchPhotosForDayInput,
): Promise<FetchPhotosForDayResult> {
  const dest = input.destinationName.trim();
  const city = input.city.trim();

  const slots: Array<{ name: string; query: string; isHero?: boolean }> = [];

  slots.push({
    name: "__hero__",
    query: buildQuery([input.focusName || city, city, dest]),
    isHero: true,
  });

  const seen = new Set<string>();
  const addNamed = (name: string, query: string) => {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    slots.push({ name: name.trim(), query });
  };

  for (const a of input.activities) {
    addNamed(
      a.name,
      resolvePoiImageSearchQuery({
        imageSearchQuery: a.imageSearchQuery,
        name: a.name,
        city,
        destinationLabel: dest,
      }),
    );
  }
  for (const p of input.mapPins ?? []) {
    addNamed(
      p.name,
      resolvePoiImageSearchQuery({
        imageSearchQuery: p.imageSearchQuery,
        name: p.name,
        city,
        destinationLabel: dest,
      }),
    );
  }

  pipelineLog("fetchPhotosForDay", `day ${input.dayNumber} — ${slots.length} queries`);

  const items: DayPhotoItem[] = [];
  let heroImageUrl: string | undefined;
  let heroImageUrls: string[] | undefined;

  for (const slot of slots) {
    const urls = await resolveQueryPhotos(slot.query);
    if (urls.length === 0) continue;
    if (slot.isHero) {
      heroImageUrl = urls[0];
      heroImageUrls = urls;
    } else {
      items.push({ name: slot.name, imageUrl: urls[0], imageUrls: urls });
    }
  }

  pipelineLog("fetchPhotosForDay done", `day ${input.dayNumber} — hero=${Boolean(heroImageUrl)} items=${items.length}`);

  return {
    dayNumber: input.dayNumber,
    heroImageUrl,
    heroImageUrls,
    items,
  };
}

export const fetchPhotosForDay = createServerFn({ method: "POST" })
  .inputValidator(fetchPhotosForDayInput)
  .handler(async ({ data }): Promise<FetchPhotosForDayResult> => {
    return fetchPhotosForDayCore(data);
  });

/** Single POI lookup for modal lazy-load. */
export const fetchPhotosForPoi = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1),
      city: z.string().min(1),
      destinationName: z.string().min(1),
      imageSearchQuery: z.string().min(1).max(220).optional(),
    }),
  )
  .handler(async ({ data }): Promise<DayPhotoItem> => {
    const query = resolvePoiImageSearchQuery({
      imageSearchQuery: data.imageSearchQuery,
      name: data.name,
      city: data.city,
      destinationLabel: data.destinationName,
    });
    const urls = await resolveQueryPhotos(query);
    return {
      name: data.name,
      imageUrl: urls[0],
      imageUrls: urls.length > 0 ? urls : undefined,
    };
  });
