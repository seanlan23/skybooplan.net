import { createFileRoute } from "@tanstack/react-router";
import {
  checkHeroFlightSearchStatus,
  checkHeroMultiOriginSearchStatus,
} from "@/lib/heroFlightSearch";

function parseOrigins(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((o) => o.trim().toUpperCase())
    .filter((o) => /^[A-Z]{3}$/.test(o));
}

export const Route = createFileRoute("/api/search/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const multiParam = url.searchParams.get("searchIds")?.trim();
        const singleParam = url.searchParams.get("searchId")?.trim();
        const origins = parseOrigins(url.searchParams.get("origins"));

        const searchIds = multiParam
          ? multiParam
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean)
          : singleParam
            ? [singleParam]
            : [];

        if (searchIds.length === 0) {
          return Response.json({ error: "Manjka searchId." }, { status: 400 });
        }

        if (searchIds.length === 1 && origins.length <= 1) {
          const searchId = searchIds[0]!;
          const result = await checkHeroFlightSearchStatus(searchId);

          if (!result.ok) {
            return Response.json(
              { status: "error", error: result.error, flights: [], offers: [] },
              { status: result.status },
            );
          }

          if (result.status === "pending") {
            return Response.json({
              status: "pending",
              searchId,
              searchIds,
              flights: [],
              offers: [],
            });
          }

          const makeExtras =
            result.makeResponse != null && typeof result.makeResponse === "object"
              ? (result.makeResponse as Record<string, unknown>)
              : {};
          return Response.json({
            ...makeExtras,
            status: "ready",
            searchId,
            searchIds,
            flights: result.flights,
            offers: result.flights,
          });
        }

        const result = await checkHeroMultiOriginSearchStatus(searchIds, { origins });

        if (!result.ok) {
          return Response.json(
            {
              status: "error",
              error: result.error,
              searchIds,
              flights: [],
              offers: [],
            },
            { status: result.status },
          );
        }

        if (result.status === "pending") {
          return Response.json({
            status: "pending",
            searchIds,
            origins,
            readyOrigins: result.readyOrigins,
            totalOrigins: result.total,
            flights: [],
            offers: [],
          });
        }

        return Response.json({
          status: "ready",
          searchIds,
          origins,
          flights: result.flights,
          offers: result.flights,
        });
      },
    },
  },
});
