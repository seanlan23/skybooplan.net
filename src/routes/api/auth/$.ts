import { createFileRoute } from "@tanstack/react-router";
import { StartAuthJS } from "start-authjs";
import { createAuthConfig } from "@/lib/auth.config";
import { ensureAuthEnv } from "@/lib/auth.env";
import { GOOGLE_AUTH_START_PATH } from "@/lib/auth.urls";

ensureAuthEnv();

const { GET, POST } = StartAuthJS(() => {
  ensureAuthEnv();
  return createAuthConfig();
});

/** Auth.js v5 rejects GET /signin/:provider — send users to the CSRF POST starter. */
function redirectGoogleGetToStarter(request: Request): Response | null {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  if (!path.endsWith("/signin/google")) return null;
  const callbackUrl =
    url.searchParams.get("callbackUrl")?.trim() ||
    `${url.origin}/auth/callback`;
  const target = new URL(GOOGLE_AUTH_START_PATH, url.origin);
  target.searchParams.set("callbackUrl", callbackUrl);
  return Response.redirect(target.toString(), 302);
}

/**
 * Auth.js API route handler for TanStack Start / Nitro.
 * Handles all auth routes: /api/auth/*
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const redirect = redirectGoogleGetToStarter(request);
          if (redirect) return redirect;
          return await GET({ request, response: new Response() });
        } catch (error) {
          console.error("[auth] GET error:", error);
          const message =
            error instanceof Error ? error.message : "Authentication service error";
          const isConfig =
            message.includes("[auth] Missing required environment variables") ||
            message.includes("AUTH_SECRET");
          return Response.json({ error: message }, { status: isConfig ? 503 : 500 });
        }
      },
      POST: async ({ request }) => {
        try {
          return await POST({ request, response: new Response() });
        } catch (error) {
          console.error("[auth] POST error:", error);
          const message =
            error instanceof Error ? error.message : "Authentication service error";
          const isConfig =
            message.includes("[auth] Missing required environment variables") ||
            message.includes("AUTH_SECRET");
          return Response.json({ error: message }, { status: isConfig ? 503 : 500 });
        }
      },
    },
  },
});
