/**
 * Maps legacy NextAuth env names (NEXTAUTH_*) and GOOGLE_* to Auth.js v5 names (AUTH_*)
 * so start-authjs / @auth/core pick them up on every server request.
 */
function normalizeAuthBaseUrl(raw: string): string {
  const base = raw.replace(/\/$/, "");
  return base.endsWith("/api/auth") ? base : `${base}/api/auth`;
}

/** Infer public site origin on Vercel / Cloudflare / Netlify when NEXTAUTH_URL is unset. */
function inferDeploymentOrigin(): string | undefined {
  const candidates = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.CF_PAGES_URL,
    process.env.URL,
  ];
  for (const value of candidates) {
    if (!value?.trim()) continue;
    const trimmed = value.trim();
    return trimmed.startsWith("http") ? trimmed.replace(/\/$/, "") : `https://${trimmed}`;
  }
  return undefined;
}

export function ensureAuthEnv(): void {
  if (typeof process === "undefined" || !process.env) return;

  if (!process.env.AUTH_SECRET && process.env.NEXTAUTH_SECRET) {
    process.env.AUTH_SECRET = process.env.NEXTAUTH_SECRET;
  }

  if (!process.env.AUTH_URL && process.env.NEXTAUTH_URL) {
    process.env.AUTH_URL = normalizeAuthBaseUrl(process.env.NEXTAUTH_URL);
  }

  // Auth.js v5: prefer site origin in NEXTAUTH_URL; full auth endpoint in AUTH_URL only.
  if (process.env.NEXTAUTH_URL?.includes("/api/auth")) {
    process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL.replace(/\/api\/auth\/?$/, "");
  }

  // @auth/core setEnvDefaults reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
  const publicGoogleId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!process.env.AUTH_GOOGLE_ID) {
    process.env.AUTH_GOOGLE_ID =
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      publicGoogleId ||
      undefined;
  }
  if (!process.env.GOOGLE_CLIENT_ID && publicGoogleId) {
    process.env.GOOGLE_CLIENT_ID = publicGoogleId;
  }
  if (!process.env.AUTH_GOOGLE_SECRET && process.env.GOOGLE_CLIENT_SECRET) {
    process.env.AUTH_GOOGLE_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  }

  // Required behind reverse proxies (Vercel, Cloudflare) so Auth.js trusts x-forwarded-host.
  process.env.AUTH_TRUST_HOST = "true";

  if (!process.env.AUTH_URL) {
    const origin = inferDeploymentOrigin();
    if (origin) {
      process.env.AUTH_URL = normalizeAuthBaseUrl(origin);
    }
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
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
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
  if (!googleClientId()) {
    missing.push("GOOGLE_CLIENT_ID (or AUTH_GOOGLE_ID / NEXT_PUBLIC_GOOGLE_CLIENT_ID)");
  }
  if (!googleClientSecret()) {
    missing.push("GOOGLE_CLIENT_SECRET (or AUTH_GOOGLE_SECRET)");
  }
  if (missing.length > 0) {
    throw new Error(
      `[auth] Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
