const AUTH_CALLBACK_PATH = "/auth/callback";

/** Auth.js Google OAuth entrypoint (TanStack Start — src/routes/api/auth/$.ts). */
export const GOOGLE_SIGN_IN_PATH = "/api/auth/signin/google";

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

/** URL that starts the Auth.js Google OAuth flow. */
export function googleSignInHref(origin?: string): string {
  const base = resolveAuthOrigin(origin);
  const callbackUrl = `${base}${AUTH_CALLBACK_PATH}`;
  return `${GOOGLE_SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

/** URL that clears the Auth.js session cookie. */
export function authSignOutHref(origin?: string): string {
  const base = resolveAuthOrigin(origin) || "/";
  return `/api/auth/signout?callbackUrl=${encodeURIComponent(base)}`;
}
