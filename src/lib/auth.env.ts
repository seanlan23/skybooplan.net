/**
 * Maps legacy NextAuth env names (NEXTAUTH_*) and GOOGLE_* to Auth.js v5 names (AUTH_*)
 * so start-authjs / @auth/core pick them up on every server request.
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

  // @auth/core setEnvDefaults reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
  if (!process.env.AUTH_GOOGLE_ID && process.env.GOOGLE_CLIENT_ID) {
    process.env.AUTH_GOOGLE_ID = process.env.GOOGLE_CLIENT_ID;
  }
  if (!process.env.AUTH_GOOGLE_SECRET && process.env.GOOGLE_CLIENT_SECRET) {
    process.env.AUTH_GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  }

  if (!process.env.AUTH_TRUST_HOST) {
    process.env.AUTH_TRUST_HOST = "true";
  }
}

export function authSecret(): string {
  ensureAuthEnv();
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  return secret?.trim() ?? "";
}

export function googleClientId(): string {
  ensureAuthEnv();
  return (
    process.env.GOOGLE_CLIENT_ID ??
    process.env.AUTH_GOOGLE_ID ??
    ""
  ).trim();
}

export function googleClientSecret(): string {
  ensureAuthEnv();
  return (
    process.env.GOOGLE_CLIENT_SECRET ??
    process.env.AUTH_GOOGLE_SECRET ??
    ""
  ).trim();
}

export function assertAuthEnvReady(): void {
  ensureAuthEnv();
  const missing: string[] = [];
  if (!authSecret()) missing.push("NEXTAUTH_SECRET (or AUTH_SECRET)");
  if (!googleClientId()) missing.push("GOOGLE_CLIENT_ID");
  if (!googleClientSecret()) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `[auth] Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
