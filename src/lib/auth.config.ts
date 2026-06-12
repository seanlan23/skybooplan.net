import Google from "@auth/core/providers/google";
import type { StartAuthJSConfig } from "start-authjs";
import { setEnvDefaults } from "start-authjs";
import {
  assertAuthEnvReady,
  authSecret,
  ensureAuthEnv,
} from "@/lib/auth.env";

/**
 * Auth.js (NextAuth) configuration for TanStack Start.
 * API handler: src/routes/api/auth/$.ts
 * (equivalent to Next.js app/api/auth/[...nextauth]/route.ts)
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL
 * Aliasi: AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
 */
export function createAuthConfig(): StartAuthJSConfig {
  ensureAuthEnv();
  if (typeof window === "undefined") {
    assertAuthEnvReady();
  }

  const secret = authSecret();
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;

  const config: StartAuthJSConfig = {
    secret,
    trustHost: true,
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

  // AUTH_URL already includes /api/auth — do not set basePath (Auth.js Configuration error).
  if (!process.env.AUTH_URL?.trim()) {
    config.basePath = "/api/auth";
  }

  setEnvDefaults(process.env, config);
  config.trustHost = true;

  return config;
}
