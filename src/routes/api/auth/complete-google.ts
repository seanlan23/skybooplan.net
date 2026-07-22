import { getToken } from "@auth/core/jwt";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { createAuthConfig } from "@/lib/auth.config";
import { ensureAuthEnv } from "@/lib/auth.env";

function useSecureAuthCookie(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;
  const authUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "";
  if (authUrl.startsWith("https://")) return true;
  if (authUrl.startsWith("http://")) return false;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json =
      typeof atob === "function"
        ? atob(part.replace(/-/g, "+").replace(/_/g, "/"))
        : Buffer.from(part, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readGoogleIdToken(request: Request): Promise<string | null> {
  const secret = createAuthConfig().secret;
  const preferSecure = useSecureAuthCookie(request);
  for (const secureCookie of [preferSecure, !preferSecure]) {
    const token = await getToken({
      req: request,
      secret,
      secureCookie,
    });
    const idToken = token?.id_token;
    if (typeof idToken === "string" && idToken.trim()) return idToken.trim();
  }
  return null;
}

/**
 * Finish Google login on the server: Auth.js cookie → Supabase session.
 * Avoids Safari "Load failed" from createServerFn + client signInWithIdToken.
 */
export const Route = createFileRoute("/api/auth/complete-google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          ensureAuthEnv();
          const idToken = await readGoogleIdToken(request);
          if (!idToken) {
            return Response.json(
              { ok: false, error: "missing_id_token" },
              { status: 401 },
            );
          }

          const supabaseUrl =
            process.env.SUPABASE_URL?.trim() ||
            process.env.VITE_SUPABASE_URL?.trim();
          const supabaseKey =
            process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
            process.env.SUPABASE_ANON_KEY?.trim();

          if (!supabaseUrl || !supabaseKey) {
            console.error("[complete-google] missing Supabase env");
            return Response.json(
              { ok: false, error: "supabase_not_configured" },
              { status: 503 },
            );
          }

          const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const payload = decodeJwtPayload(idToken);
          const nonce =
            typeof payload?.nonce === "string" ? payload.nonce : undefined;

          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: idToken,
            ...(nonce ? { nonce } : {}),
          });

          if (error || !data.session) {
            console.error("[complete-google] supabase:", error?.message);
            return Response.json(
              {
                ok: false,
                error: error?.message || "supabase_signin_failed",
              },
              { status: 401 },
            );
          }

          return Response.json({
            ok: true,
            session: {
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            },
          });
        } catch (error) {
          console.error("[complete-google] failed:", error);
          return Response.json(
            { ok: false, error: "complete_failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
