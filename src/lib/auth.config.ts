import Google from "@auth/core/providers/google";
import type { StartAuthJSConfig } from "start-authjs";
import { setEnvDefaults } from "start-authjs";
import {
  assertAuthEnvReady,
  ensureAuthEnv,
} from "@/lib/auth.env";

/** Injected for Nitro/Vercel — Auth.js must receive secret at config root, not via process.env. */
const AUTH_SECRET = "H7XVKUqOghWAhanM5K6cOSOqqeX1cvoXdCxFOHuKIl8=";

/**
 * Auth.js (NextAuth) configuration for TanStack Start.
 * API handler: src/routes/api/auth/$.ts
 * (equivalent to Next.js app/api/auth/[...nextauth]/route.ts)
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_URL
 * Aliasi: AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
 */
export function createAuthConfig(): StartAuthJSConfig {
  ensureAuthEnv();
  if (typeof window === "undefined") {
    assertAuthEnvReady();
  }

  const clientId = (
    process.env.GOOGLE_CLIENT_ID ||
    process.env.AUTH_GOOGLE_ID ||
    ""
  ).trim();
  const clientSecret = (
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.AUTH_GOOGLE_SECRET ||
    ""
  ).trim();

  const config: StartAuthJSConfig = {
    secret: AUTH_SECRET,
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
        if (profile?.picture) token.picture = profile.picture;
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

  config.basePath = "/api/auth";
  setEnvDefaults(process.env, config);
  // setEnvDefaults (and StartAuthJS) may wipe empty-env placeholders — force finals.
  config.trustHost = true;
  config.basePath = "/api/auth";
  config.secret = AUTH_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "[auth] Missing required environment variables: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET",
    );
  }
  // Re-apply after setEnvDefaults — it can drop custom JWT callbacks (id_token bridge).
  config.callbacks = {
    async jwt({ token, account, profile }) {
      if (account?.id_token) {
        token.id_token = account.id_token;
      }
      if (account?.access_token) {
        token.access_token = account.access_token;
      }
      if (profile?.name) token.name = profile.name;
      if (profile?.picture) token.picture = profile.picture;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        if (token.name) session.user.name = token.name as string;
        if (token.picture) session.user.image = token.picture as string;
      }
      return session;
    },
  };
  config.providers = [
    Google({
      clientId,
      clientSecret,
    }),
  ];

  return config;
}
