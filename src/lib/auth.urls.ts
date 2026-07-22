const AUTH_CALLBACK_PATH = "/auth/callback";

/** Branded client starter that launches Supabase Google OAuth (full page redirect). */
export const GOOGLE_AUTH_PAGE_PATH = "/auth/google";

/** @deprecated Auth.js path — kept for legacy bookmarks / redirects. */
export const GOOGLE_SIGN_IN_PATH = "/api/auth/signin/google";

/** @deprecated Auth.js CSRF starter — login now uses Supabase via /auth/google. */
export const GOOGLE_AUTH_START_PATH = "/api/auth/google-start";

function resolveAuthOrigin(origin?: string): string {
  if (origin?.trim()) return origin.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  const fromEnv = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "")
    .trim()
    .replace(/\/api\/auth\/?$/, "")
    .replace(/\/$/, "");
  return fromEnv || "";
}

/** Callback URL after Google OAuth (Supabase redirects here with ?code=). */
export function googleAuthCallbackUrl(origin?: string): string {
  const base = resolveAuthOrigin(origin);
  return `${base}${AUTH_CALLBACK_PATH}`;
}

/** Safe href for Google login buttons — branded page, then Supabase OAuth. */
export function googleSignInHref(origin?: string): string {
  const callbackUrl = googleAuthCallbackUrl(origin);
  return `${GOOGLE_AUTH_PAGE_PATH}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

/**
 * @deprecated Prefer navigating to `googleSignInHref()`.
 */
export async function startGoogleSignIn(origin?: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("startGoogleSignIn is browser-only");
  }
  window.location.assign(googleSignInHref(origin));
}

/** URL that clears the Auth.js session cookie (legacy). */
export function authSignOutHref(origin?: string): string {
  const base = resolveAuthOrigin(origin) || "/";
  return `/api/auth/signout?callbackUrl=${encodeURIComponent(base)}`;
}
