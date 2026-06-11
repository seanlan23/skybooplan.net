import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type SupabaseRequestAuth = {
  supabase: ReturnType<typeof createClient<Database>>;
  userId: string;
  claims: Record<string, unknown>;
};

export type SupabaseAuthRequestResult =
  | { ok: true; auth: SupabaseRequestAuth }
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
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error("[Supabase] Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
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

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) {
    return unauthorized("Unauthorized: Invalid token.");
  }

  const sub = data.claims.sub;
  if (typeof sub !== "string" || !sub) {
    return unauthorized("Unauthorized: No user ID found in token.");
  }

  return {
    ok: true,
    auth: {
      supabase,
      userId: sub,
      claims: data.claims as Record<string, unknown>,
    },
  };
}
