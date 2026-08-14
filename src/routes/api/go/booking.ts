import { createFileRoute } from "@tanstack/react-router";
import {
  allowedBookingDest,
  readCjClickUrl,
  renderBookingHopHtml,
  toCjTrackedUrl,
} from "@/lib/bookingUrl";

export const Route = createFileRoute("/api/go/booking")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") ?? "";
        const dest = allowedBookingDest(raw);
        const tracked = dest ? toCjTrackedUrl(dest, readCjClickUrl()) : null;
        if (!tracked) {
          return Response.redirect("https://www.booking.com/", 302);
        }
        return new Response(renderBookingHopHtml(tracked), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer-when-downgrade",
          },
        });
      },
    },
  },
});
