const AUTH_CALLBACK_PATH = "/auth/callback";

/** Auth.js Google OAuth POST endpoint (never navigate here with GET). */
export const GOOGLE_SIGN_IN_PATH = "/api/auth/signin/google";

/**
 * Server HTML starter — issues CSRF cookie + auto-POSTs to Auth.js.
 * Prefer this over client fetch (Safari: TypeError "Load failed").
 */
export const GOOGLE_AUTH_START_PATH = "/api/auth/google-start";

/** Legacy client page (kept for bookmarks). */
export const GOOGLE_AUTH_PAGE_PATH = "/auth/google";

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

/** Callback URL after Google OAuth (bridges into Supabase). */
export function googleAuthCallbackUrl(origin?: string): string {
  const base = resolveAuthOrigin(origin);
  return `${base}${AUTH_CALLBACK_PATH}`;
}

/** Safe href for Google login buttons — full navigation, no client fetch. */
export function googleSignInHref(origin?: string): string {
  const callbackUrl = googleAuthCallbackUrl(origin);
  return `${GOOGLE_AUTH_START_PATH}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

/**
 * @deprecated Prefer `googleSignInHref()` (server starter).
 * Kept for `/auth/google` fallback page.
 */
export async function startGoogleSignIn(origin?: string): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("startGoogleSignIn is browser-only");
  }
  window.location.assign(googleSignInHref(origin));
}

/** URL that clears the Auth.js session cookie. */
export function authSignOutHref(origin?: string): string {
  const base = resolveAuthOrigin(origin) || "/";
  return `/api/auth/signout?callbackUrl=${encodeURIComponent(base)}`;
}
