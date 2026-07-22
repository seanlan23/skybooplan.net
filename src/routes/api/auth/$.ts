import { Auth } from "@auth/core";
import { createFileRoute } from "@tanstack/react-router";
import { createAuthConfig } from "@/lib/auth.config";
import { ensureAuthEnv } from "@/lib/auth.env";
import { GOOGLE_AUTH_PAGE_PATH } from "@/lib/auth.urls";

ensureAuthEnv();

/** Auth.js v5 rejects GET /signin/:provider — send users to the CSRF POST starter. */
function redirectGoogleGetToStarter(request: Request): Response | null {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  if (!path.endsWith("/signin/google")) return null;
  const callbackUrl =
    url.searchParams.get("callbackUrl")?.trim() ||
    `${url.origin}/auth/callback`;
  // Send legacy GET hits to the client page, which immediately jumps to google-start.
  const target = new URL(GOOGLE_AUTH_PAGE_PATH, url.origin);
  target.searchParams.set("callbackUrl", callbackUrl);
  return Response.redirect(target.toString(), 302);
}

async function handle(request: Request): Promise<Response> {
  ensureAuthEnv();
  const config = createAuthConfig();
  // Call Auth directly — StartAuthJS runs setEnvDefaults again and can wipe Google creds.
  return Auth(request, config);
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
          return await handle(request);
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
          return await handle(request);
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
