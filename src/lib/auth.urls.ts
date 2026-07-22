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

/** Callback URL after Google OAuth (bridges into Supabase). */
export function googleAuthCallbackUrl(origin?: string): string {
  const base = resolveAuthOrigin(origin);
  return `${base}${AUTH_CALLBACK_PATH}`;
}

/**
 * @deprecated Auth.js v5 rejects GET /signin/google (UnknownAction).
 * Use `startGoogleSignIn()` which POSTs with CSRF.
 */
export function googleSignInHref(origin?: string): string {
  const callbackUrl = googleAuthCallbackUrl(origin);
  return `${GOOGLE_SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

/**
 * Start Google OAuth the Auth.js v5 way: CSRF + POST form submit.
 * GET /api/auth/signin/google throws UnknownAction("Unsupported action").
 */
export async function startGoogleSignIn(origin?: string): Promise<void> {
  const callbackUrl = googleAuthCallbackUrl(origin);
  const csrfRes = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  if (!csrfRes.ok) {
    throw new Error("Failed to fetch auth CSRF token");
  }
  const data = (await csrfRes.json()) as { csrfToken?: string };
  const csrfToken = data.csrfToken?.trim();
  if (!csrfToken) {
    throw new Error("Missing auth CSRF token");
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = GOOGLE_SIGN_IN_PATH;
  form.style.display = "none";

  const csrfInput = document.createElement("input");
  csrfInput.type = "hidden";
  csrfInput.name = "csrfToken";
  csrfInput.value = csrfToken;
  form.appendChild(csrfInput);

  const callbackInput = document.createElement("input");
  callbackInput.type = "hidden";
  callbackInput.name = "callbackUrl";
  callbackInput.value = callbackUrl;
  form.appendChild(callbackInput);

  document.body.appendChild(form);
  form.submit();
}

/** URL that clears the Auth.js session cookie. */
export function authSignOutHref(origin?: string): string {
  const base = resolveAuthOrigin(origin) || "/";
  return `/api/auth/signout?callbackUrl=${encodeURIComponent(base)}`;
}
