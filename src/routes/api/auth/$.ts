import { Auth } from "@auth/core";
import { createFileRoute } from "@tanstack/react-router";
import { createAuthConfig } from "@/lib/auth.config";
import { ensureAuthEnv } from "@/lib/auth.env";

ensureAuthEnv();

async function handleAuthRequest(request: Request): Promise<Response> {
  try {
    ensureAuthEnv();
    const config = createAuthConfig();
    return await Auth(request, config);
  } catch (error) {
    console.error("[auth] handler error:", error);
    const message =
      error instanceof Error ? error.message : "Authentication service error";
    const isConfig =
      message.includes("[auth] Missing required environment variables") ||
      message.includes("AUTH_SECRET");
    return Response.json({ error: message }, { status: isConfig ? 503 : 500 });
  }
}

/**
 * Auth.js API route handler for TanStack Start / Nitro.
 * Handles all auth routes: /api/auth/*
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => handleAuthRequest(request),
      POST: async ({ request }) => handleAuthRequest(request),
    },
  },
});
