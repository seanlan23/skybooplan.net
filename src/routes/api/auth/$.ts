import { createFileRoute } from "@tanstack/react-router";
import { StartAuthJS } from "start-authjs";
import { authConfig } from "@/lib/auth.config";

/**
 * TanStack Start equivalent of Next.js:
 *   src/app/api/auth/[...nextauth]/route.ts
 */
const { GET, POST } = StartAuthJS(authConfig);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => GET({ request, response: new Response() }),
      POST: ({ request }) => POST({ request, response: new Response() }),
    },
  },
});
