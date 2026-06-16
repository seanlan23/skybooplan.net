import { createFileRoute } from "@tanstack/react-router";
import { fetchHeroPhoto, pickHeroQuery } from "@/lib/heroPhotos";

export const Route = createFileRoute("/api/hero-photo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const seedRaw = url.searchParams.get("seed");
        const seed = seedRaw != null ? Number(seedRaw) : undefined;
        const queryParam = url.searchParams.get("query")?.trim();
        const query =
          queryParam && queryParam.length >= 3
            ? queryParam
            : pickHeroQuery(Number.isFinite(seed) ? seed : undefined);

        const photo = await fetchHeroPhoto(query, {
          pageSeed: Number.isFinite(seed) ? seed : undefined,
        });
        return Response.json(photo, {
          headers: { "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
