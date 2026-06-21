import { createFileRoute } from "@tanstack/react-router";
import { searchHeroFlights } from "@/lib/heroFlightSearch";
import { parseSearchRequestBody } from "@/lib/makeSearch";

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Neveljavno JSON telo." }, { status: 400 });
        }

        const parsed = parseSearchRequestBody(body);
        if (!parsed) {
          return Response.json({ error: "Manjka query (niz)." }, { status: 400 });
        }

        console.log("[api/search] Hero search query:", parsed.query.slice(0, 120), {
          attachment: parsed.attachment?.kind ?? null,
          latitude: parsed.latitude ?? null,
          longitude: parsed.longitude ?? null,
        });

        const location =
          parsed.latitude != null && parsed.longitude != null
            ? { latitude: parsed.latitude, longitude: parsed.longitude }
            : undefined;

        const result = await searchHeroFlights(parsed.query, parsed.attachment, location);

        if (!result.ok) {
          console.warn("[api/search] Search failed:", result.error);
          return Response.json({ error: result.error, flights: [] }, { status: result.status });
        }

        if ("pending" in result && result.pending) {
          console.log("[api/search] Async Make search started:", result.searchId);
          return Response.json({
            status: "pending",
            searchId: result.searchId,
            flights: [],
            offers: [],
          });
        }

        if (result.makeResponse != null) {
          console.log("[api/search] Returning Make webhook JSON:", {
            offers: Array.isArray((result.makeResponse as { offers?: unknown }).offers)
              ? (result.makeResponse as { offers: unknown[] }).offers.length
              : null,
          });
          return Response.json(result.makeResponse);
        }

        console.log("[api/search] Returning flights:", result.flights.length, {
          origin: result.parsed.origin_iata,
          destination: result.parsed.destination_iata,
          depart: result.parsed.depart_date,
        });

        return Response.json({ flights: result.flights });
      },
    },
  },
});
