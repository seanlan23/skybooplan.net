import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getToken } from "@auth/core/jwt";
import { createAuthConfig } from "@/lib/auth.config";

/** Read the Google id_token from the Auth.js session cookie (server-only). */
export const fetchGoogleIdToken = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const secureCookie = new URL(request.url).protocol === "https:";

  const token = await getToken({
    req: request,
    secret: createAuthConfig().secret,
    secureCookie,
  });

  const idToken = token?.id_token;
  if (typeof idToken !== "string" || !idToken.trim()) {
    return { ok: false as const, error: "missing_id_token" as const };
  }

  return { ok: true as const, id_token: idToken };
});
