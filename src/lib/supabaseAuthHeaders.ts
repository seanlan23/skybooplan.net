import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

const REFRESH_SKEW_MS = 60_000;

function sessionIsFresh(session: Session | null | undefined): boolean {
  if (!session?.access_token || !session.user?.id) return false;
  const expMs = (session.expires_at ?? 0) * 1000;
  return expMs > Date.now() + REFRESH_SKEW_MS;
}

/** Refresh when missing or about to expire — leftover tokens after a Supabase pause 401 every save. */
export async function ensureFreshAuthSession(): Promise<Session | null> {
  const { data: first } = await supabase.auth.getSession();
  if (sessionIsFresh(first.session)) return first.session;

  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (!error && sessionIsFresh(refreshed.session)) return refreshed.session;
  // Expired leftover after pause/resume — do not send a dead JWT to PostgREST.
  return null;
}

/** True when Supabase has a session with a usable access token. */
export async function hasAuthSession(): Promise<boolean> {
  const session = await ensureFreshAuthSession();
  return Boolean(session?.access_token);
}

/** Bearer token headers for direct fetch() calls to protected /api/* routes. */
export async function supabaseAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const session = await ensureFreshAuthSession();
  const token = session?.access_token;
  const headers: Record<string, string> = { ...extra };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
