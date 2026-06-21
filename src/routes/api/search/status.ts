import { createFileRoute } from "@tanstack/react-router";
import { checkHeroFlightSearchStatus } from "@/lib/heroFlightSearch";

export const Route = createFileRoute("/api/search/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const searchId = new URL(request.url).searchParams.get("searchId")?.trim();
        if (!searchId) {
          return Response.json({ error: "Manjka searchId." }, { status: 400 });
        }

        const result = await checkHeroFlightSearchStatus(searchId);

        if (!result.ok) {
          return Response.json(
            { status: "error", error: result.error, flights: [], offers: [] },
            { status: result.status },
          );
        }

        if (result.status === "pending") {
          return Response.json({ status: "pending", searchId, flights: [], offers: [] });
        }

        return Response.json({
          status: "ready",
          searchId,
          flights: result.flights,
          offers: result.flights,
          ...(result.makeResponse != null && typeof result.makeResponse === "object"
            ? (result.makeResponse as Record<string, unknown>)
            : {}),
        });
      },
    },
  },
});
