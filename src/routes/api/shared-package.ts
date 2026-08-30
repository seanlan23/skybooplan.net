import { createFileRoute } from "@tanstack/react-router";
import { loadSharedPackageSnapshot } from "@/lib/sharedPackageLoad.server";
import { unquoteShareValue } from "@/lib/sharedPackageSnapshot";

export const Route = createFileRoute("/api/shared-package")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const snapshot = await loadSharedPackageSnapshot({
          id: unquoteShareValue(url.searchParams.get("id") ?? ""),
          hotelId: unquoteShareValue(url.searchParams.get("hotelId") ?? ""),
          to: url.searchParams.get("to") ?? "",
          depart: url.searchParams.get("depart") ?? "",
        });
        if (!snapshot) {
          return Response.json({ snapshot: null }, { status: 404 });
        }
        return Response.json(
          { snapshot },
          { headers: { "Cache-Control": "public, max-age=60" } },
        );
      },
    },
  },
});
