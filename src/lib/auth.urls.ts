const AUTH_CALLBACK_PATH = "/auth/callback";

/** Auth.js Google OAuth entrypoint (TanStack Start — src/routes/api/auth/$.ts). */
export const GOOGLE_SIGN_IN_PATH = "/api/auth/signin/google";

/** URL that starts the Auth.js Google OAuth flow. */
export function googleSignInHref(origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const callbackUrl = `${base}${AUTH_CALLBACK_PATH}`;
  return `${GOOGLE_SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

/** URL that clears the Auth.js session cookie. */
export function authSignOutHref(origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "/");
  return `/api/auth/signout?callbackUrl=${encodeURIComponent(base)}`;
}
