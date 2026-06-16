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
        });

        const result = await searchHeroFlights(parsed.query, parsed.attachment);

        if (!result.ok) {
          console.warn("[api/search] Search failed:", result.error);
          return Response.json({ error: result.error, flights: [] }, { status: result.status });
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
