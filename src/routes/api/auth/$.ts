import { createFileRoute } from "@tanstack/react-router";
import { StartAuthJS } from "start-authjs";
import { createAuthConfig } from "@/lib/auth.config";

/**
 * TanStack Start equivalent of Next.js App Router:
 *   const handler = NextAuth(authOptions);
 *   export { handler as GET, handler as POST };
 *
 * Here StartAuthJS builds the handler per request so env vars are read at runtime.
 */
const authHandlers = StartAuthJS(() => createAuthConfig());

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) =>
        authHandlers.GET({ request, response: new Response() }),
      POST: ({ request }) =>
        authHandlers.POST({ request, response: new Response() }),
    },
  },
});
