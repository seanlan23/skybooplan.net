import { createClient } from "@supabase/supabase-js";
import {
  getServerSupabaseServiceRoleKey,
  getServerSupabaseUrl,
} from "@/lib/supabaseServerEnv";
import { resolvePublicPlanCount } from "@/lib/planStats";

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

async function sumColumn(
  db: NonNullable<ReturnType<typeof svc>>,
  table: string,
  column: string,
): Promise<number> {
  const { data, error } = await db.from(table).select(column).limit(20_000);
  if (error || !Array.isArray(data)) return 0;
  return data.reduce((sum, row) => {
    const value = Number((row as Record<string, unknown>)[column]);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

async function liveGeneratedTotal(
  db: NonNullable<ReturnType<typeof svc>>,
): Promise<number> {
  const liveRpc = await db.rpc("live_plans_generated_sum");
  if (!liveRpc.error && liveRpc.data != null) {
    const n = Number(liveRpc.data);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const [anon, daily] = await Promise.all([
    sumColumn(db, "anonymous_plan_attempts", "plan_count"),
    sumColumn(db, "daily_plan_usage", "plans_generated"),
  ]);
  return anon + daily;
}

export async function readPublicPlansGenerated(): Promise<number> {
  if (_cached && Date.now() - _cached.at < CACHE_MS) return _cached.count;
  const db = svc();
  if (!db) return resolvePublicPlanCount(0);

  const rpc = await db.rpc("public_plans_generated");
  const stored =
    !rpc.error && rpc.data != null ? Number(rpc.data) || 0 : 0;
  const live = await liveGeneratedTotal(db);
  const count = resolvePublicPlanCount(stored, live);

  if (count > stored) {
    const heal = await db.from("site_stats").upsert(
      {
        id: 1,
        plans_generated: count,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (heal.error) {
      console.warn("[planStats] could not persist public plan count", heal.error.message);
    }
  }

  _cached = { count, at: Date.now() };
  return count;
}

export async function bumpPublicPlansGenerated(): Promise<void> {
  const db = svc();
  if (!db) return;
  const { error } = await db.rpc("bump_plans_generated");
  if (!error) {
    if (_cached) {
      _cached = { count: _cached.count + 1, at: Date.now() };
    }
    return;
  }
  // RPC missing — keep the in-memory cache honest until the next live read.
  if (_cached) {
    _cached = { count: _cached.count + 1, at: Date.now() };
  } else {
    _cached = null;
  }
}
