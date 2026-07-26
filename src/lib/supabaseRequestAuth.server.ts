import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  getServerSupabaseAnonKey,
  getServerSupabaseUrl,
} from "@/lib/supabaseServerEnv";

export type SupabaseRequestAuth = {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
  claims: Record<string, unknown>;
};

export type SupabaseAuthRequestResult =
  | { ok: true; auth: SupabaseRequestAuth }
  | { ok: false; response: Response };

export type OptionalSupabaseAuthRequestResult =
  | { ok: true; userId: string | null; auth?: SupabaseRequestAuth }
  | { ok: false; response: Response };

function unauthorized(message: string): SupabaseAuthRequestResult {
  return {
    ok: false,
    response: Response.json({ error: message }, { status: 401 }),
  };
}

/**
 * Validates Bearer JWT from a TanStack Start API route Request.
 * Mirrors integrations/supabase/auth-middleware requireSupabaseAuth logic.
 */
export async function requireSupabaseAuthRequest(
  request: Request,
): Promise<SupabaseAuthRequestResult> {
  const SUPABASE_URL = getServerSupabaseUrl();
  const SUPABASE_PUBLISHABLE_KEY = getServerSupabaseAnonKey();

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error(
      "[Supabase] Missing SUPABASE_URL / VITE_SUPABASE_URL or publishable key on server",
    );
    return unauthorized("Authentication is not configured.");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return unauthorized("Unauthorized: No authorization header provided.");
  if (!authHeader.startsWith("Bearer ")) {
    return unauthorized("Unauthorized: Only Bearer tokens are supported.");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return unauthorized("Unauthorized: No token provided.");

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Prefer getClaims (fast JWKS); fall back to getUser for older symmetric JWT projects.
  const claimsResult = await supabase.auth.getClaims(token);
  let userId: string | null = null;
  let claims: Record<string, unknown> = {};

  if (!claimsResult.error && claimsResult.data?.claims) {
    const sub = claimsResult.data.claims.sub;
    if (typeof sub === "string" && sub) {
      userId = sub;
      claims = claimsResult.data.claims as Record<string, unknown>;
    }
  }

  if (!userId) {
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user?.id) {
      console.error("[Supabase] JWT verify failed:", claimsResult.error ?? userErr);
      return unauthorized("Unauthorized: Invalid token.");
    }
    userId = userData.user.id;
    claims = { sub: userId, email: userData.user.email };
  }

  return {
    ok: true,
    auth: {
      supabase,
      userId,
      claims,
    },
  };
}

/** Like requireSupabaseAuthRequest, but allows missing Bearer token (anonymous preview). */
export async function optionalSupabaseAuthRequest(
  request: Request,
): Promise<OptionalSupabaseAuthRequestResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: true, userId: null };
  }

  const authResult = await requireSupabaseAuthRequest(request);
  if (!authResult.ok) return authResult;

  return { ok: true, userId: authResult.auth.userId, auth: authResult.auth };
}
