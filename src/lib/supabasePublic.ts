/** Public Supabase URL + anon key (safe in the browser). */

export function getSupabaseUrl(): string {
  return (
    (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    ""
  );
}

export function getSupabaseAnonKey(): string {
  return (
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}

/**
 * Browser navigations to Supabase Auth need `apikey` in the query string
 * (custom headers are not sent on full-page redirects).
 */
export function withSupabaseApiKey(oauthUrl: string): string {
  const key = getSupabaseAnonKey();
  if (!key) return oauthUrl;
  try {
    const url = new URL(oauthUrl);
    if (!url.searchParams.has("apikey")) {
      url.searchParams.set("apikey", key);
    }
    return url.toString();
  } catch {
    return oauthUrl;
  }
}
