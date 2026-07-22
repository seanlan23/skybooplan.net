import { createFileRoute } from "@tanstack/react-router";
import { StartAuthJS } from "start-authjs";
import { createAuthConfig } from "@/lib/auth.config";
import { ensureAuthEnv } from "@/lib/auth.env";

ensureAuthEnv();

const { GET, POST } = StartAuthJS(() => {
  ensureAuthEnv();
  return createAuthConfig();
});

/**
 * Auth.js API route handler for TanStack Start / Nitro.
 * Handles all auth routes: /api/auth/*
 */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
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
