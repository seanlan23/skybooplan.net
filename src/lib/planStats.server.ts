import { createClient } from "@supabase/supabase-js";
import {
  getServerSupabaseServiceRoleKey,
  getServerSupabaseUrl,
} from "@/lib/supabaseServerEnv";

let _db: ReturnType<typeof createClient> | null = null;
let _cached: { count: number; at: number } | null = null;
const CACHE_MS = 60_000;

function svc() {
  const url = getServerSupabaseUrl();
  const key = getServerSupabaseServiceRoleKey();
  if (!url || !key) return null;
  if (!_db) _db = createClient(url, key);
  return _db;
}

async function sumExistingPlanRows(
  db: NonNullable<ReturnType<typeof svc>>,
): Promise<number> {
  const [anon, saved] = await Promise.all([
    db.from("anonymous_plan_attempts").select("plan_count").limit(10_000),
    db.from("travel_plans").select("id", { count: "exact", head: true }),
  ]);
  const anonSum = (anon.data ?? []).reduce(
    (sum, row) => sum + (Number((row as { plan_count?: number }).plan_count) || 0),
    0,
  );
  const savedCount = saved.count ?? 0;
  return anonSum + savedCount;
}

export async function readPublicPlansGenerated(): Promise<number> {
  if (_cached && Date.now() - _cached.at < CACHE_MS) return _cached.count;
  const db = svc();
  if (!db) return 0;

  const rpc = await db.rpc("public_plans_generated");
  let count = 0;
  if (!rpc.error && rpc.data != null) {
    count = Number(rpc.data) || 0;
  } else {
    count = await sumExistingPlanRows(db);
  }

  _cached = { count, at: Date.now() };
  return count;
}

export async function bumpPublicPlansGenerated(): Promise<void> {
  const db = svc();
  if (!db) return;
  const { error } = await db.rpc("bump_plans_generated");
  if (!error) {
    _cached = null;
    return;
  }
  // Migration not applied yet — next read still sums live tables.
}
