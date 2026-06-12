import Google from "@auth/core/providers/google";
import type { StartAuthJSConfig } from "start-authjs";
import {
  assertAuthEnvReady,
  authSecret,
  ensureAuthEnv,
  googleClientId,
  googleClientSecret,
} from "@/lib/auth.env";

/**
 * Auth.js (NextAuth) configuration for TanStack Start.
 * API handler: src/routes/api/auth/$.ts
 * (equivalent to Next.js app/api/auth/[...nextauth]/route.ts)
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL
 * Aliasi: AUTH_GOOGLE_*, NEXT_PUBLIC_GOOGLE_CLIENT_ID (samo client ID)
 */
export function createAuthConfig(): StartAuthJSConfig {
  ensureAuthEnv();
  assertAuthEnvReady();

  const secret = authSecret();
  const clientId =
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    process.env.AUTH_GOOGLE_ID?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    googleClientId();
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.AUTH_GOOGLE_SECRET?.trim() ||
    googleClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error(
      `[auth] Google OAuth is not configured (clientId=${Boolean(clientId)}, clientSecret=${Boolean(clientSecret)})`,
    );
  }

  return {
    secret,
    trustHost: true,
    basePath: "/api/auth",
    session: {
      strategy: "jwt",
    },
    providers: [
      Google({
        clientId,
        clientSecret,
      }),
    ],
    callbacks: {
      async jwt({ token, account, profile }) {
        if (account?.id_token) {
          token.id_token = account.id_token;
        }
        if (profile?.name) token.name = profile.name;
        if (profile.picture) token.picture = profile.picture;
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          if (token.name) session.user.name = token.name as string;
          if (token.picture) session.user.image = token.picture as string;
        }
        return session;
      },
    },
  };
}
