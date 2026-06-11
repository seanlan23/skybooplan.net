import { supabase } from "@/integrations/supabase/client";

/** True when Supabase has a session with a usable access token. */
export async function hasAuthSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.access_token);
}

/** Bearer token headers for direct fetch() calls to protected /api/* routes. */
export async function supabaseAuthHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { ...extra };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
