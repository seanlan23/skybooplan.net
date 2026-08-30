import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  getServerSupabaseAnonKey,
  getServerSupabaseServiceRoleKey,
  getServerSupabaseUrl,
} from "@/lib/supabaseServerEnv";

/** Service role when present; otherwise the public anon key (needs RLS policies). */
export function createSharedPackagesClient() {
  const url = getServerSupabaseUrl();
  const key = getServerSupabaseServiceRoleKey() || getServerSupabaseAnonKey();
  if (!url || !key) {
    throw new Error("Supabase is not configured for shared packages");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
