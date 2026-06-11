import Google from "@auth/core/providers/google";
import type { StartAuthJSConfig } from "start-authjs";
import { authSecret, ensureAuthEnv, googleClientId, googleClientSecret } from "@/lib/auth.env";

ensureAuthEnv();

/**
 * Auth.js (NextAuth) configuration for TanStack Start.
 * API handler: src/routes/api/auth/$.ts  (equivalent to app/api/auth/[...nextauth]/route.ts)
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, NEXTAUTH_URL
 */
export const authConfig: StartAuthJSConfig = {
  secret: authSecret(),
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: googleClientId(),
      clientSecret: googleClientSecret(),
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
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
