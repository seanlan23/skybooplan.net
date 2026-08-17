import { createClient } from "@supabase/supabase-js";
import {
  getServerSupabaseServiceRoleKey,
  getServerSupabaseUrl,
} from "@/lib/supabaseServerEnv";
import { KNOWN_PLANS_GENERATED_FLOOR, resolvePublicPlanCount } from "@/lib/planStats";

let _db: ReturnType<typeof createClient> | null = null;
let _cached: { count: number; at: number } | null = null;
const CACHE_MS = 8_000;

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

async function readStored(
  db: NonNullable<ReturnType<typeof svc>>,
): Promise<number> {
  const rpc = await db.rpc("public_plans_generated");
  const fromRpc =
    !rpc.error && rpc.data != null ? Number(rpc.data) : Number.NaN;
  const { data } = await db
    .from("site_stats")
    .select("plans_generated")
    .eq("id", 1)
    .maybeSingle();
  const fromTable = Number((data as { plans_generated?: number } | null)?.plans_generated);
  return Math.max(
    0,
    Number.isFinite(fromRpc) ? fromRpc : 0,
    Number.isFinite(fromTable) ? fromTable : 0,
  );
}

async function persistAtLeast(
  db: NonNullable<ReturnType<typeof svc>>,
  target: number,
): Promise<void> {
  const stored = await readStored(db);
  const next = Math.max(stored, target);
  if (next <= stored) return;
  const { error } = await db.from("site_stats").upsert(
    {
      id: 1,
      plans_generated: next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) {
    console.warn("[planStats] could not persist public plan count", error.message);
  }
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

  const stored = await readStored(db);
  const live = await liveGeneratedTotal(db);
  const count = resolvePublicPlanCount(stored, live);
  await persistAtLeast(db, count);

  _cached = { count, at: Date.now() };
  return count;
}

export async function bumpPublicPlansGenerated(): Promise<void> {
  const db = svc();
  if (!db) {
    console.warn("[planStats] bump skipped — Supabase service role is not configured");
    return;
  }

  const rpc = await db.rpc("bump_plans_generated");
  if (!rpc.error) {
    const stored = await readStored(db);
    _cached = {
      count: Math.max(stored, (_cached?.count ?? KNOWN_PLANS_GENERATED_FLOOR) + 1),
      at: Date.now(),
    };
    return;
  }

  console.warn("[planStats] bump RPC failed, writing site_stats", rpc.error.message);
  const stored = await readStored(db);
  const next = Math.max(stored, KNOWN_PLANS_GENERATED_FLOOR) + 1;
  await persistAtLeast(db, next);
  _cached = { count: next, at: Date.now() };
}
