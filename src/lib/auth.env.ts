/**
 * Maps legacy NextAuth env names (NEXTAUTH_*) to Auth.js v5 names (AUTH_*)
 * so start-authjs / @auth/core pick them up automatically.
 */
export function ensureAuthEnv(): void {
  if (typeof process === "undefined" || !process.env) return;

  if (!process.env.AUTH_SECRET && process.env.NEXTAUTH_SECRET) {
    process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
  }

  if (!process.env.AUTH_URL && process.env.NEXTAUTH_URL) {
    const base = process.env.NEXTAUTH_URL.replace(/\/$/, "");
    process.env.AUTH_URL = base.endsWith("/api/auth") ? base : `${base}/api/auth`;
  }
}

export function authSecret(): string {
  ensureAuthEnv();
  return (
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.GOOGLE_CLIENT_SECRET ??
    "dev-only-auth-secret-change-me"
  );
}

export function googleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID ?? "";
}

export function googleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET ?? "";
}
