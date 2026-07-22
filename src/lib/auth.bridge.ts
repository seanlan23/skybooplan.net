import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getToken } from "@auth/core/jwt";
import { createAuthConfig } from "@/lib/auth.config";

/** Prefer proxy / AUTH_URL over raw request.url (Nitro often reports http behind TLS). */
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

/** Read the Google id_token from the Auth.js session cookie (server-only). */
export const fetchGoogleIdToken = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const secret = createAuthConfig().secret;
  const preferSecure = useSecureAuthCookie(request);

  // Try preferred cookie mode first, then the other — avoids bridge failure on proto mismatch.
  for (const secureCookie of [preferSecure, !preferSecure]) {
    const token = await getToken({
      req: request,
      secret,
      secureCookie,
    });
    const idToken = token?.id_token;
    if (typeof idToken === "string" && idToken.trim()) {
      return { ok: true as const, id_token: idToken };
    }
  }

  return { ok: false as const, error: "missing_id_token" as const };
});
