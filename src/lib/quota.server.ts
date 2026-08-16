import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { hasUnlimitedAccess } from '@/lib/unlimitedAccess';
import {
  getServerSupabaseServiceRoleKey,
  getServerSupabaseUrl,
} from '@/lib/supabaseServerEnv';
import { bumpPublicPlansGenerated } from '@/lib/planStats.server';

let _supabase: ReturnType<typeof createClient> | null = null;
let _quotaSkipLogged = false;

function supabaseConfigured(): boolean {
  return Boolean(getServerSupabaseUrl() && getServerSupabaseServiceRoleKey());
}

function svc() {
  const url = getServerSupabaseUrl();
  const key = getServerSupabaseServiceRoleKey();
  if (!url || !key) return null;
  if (!_supabase) {
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function logQuotaSkippedOnce(): void {
  if (_quotaSkipLogged) return;
  _quotaSkipLogged = true;
  console.warn(
    "[quota] Supabase not configured — skipping anon/user quota checks (local dev only).",
  );
}

export function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(`skybooplan:${ip}`).digest('hex');
}

export function extractIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    (headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

const PLACES_SEARCH_WINDOW_MS = 60_000;
const PLACES_SEARCH_MAX_PER_WINDOW = 40;
const placesSearchHits = new Map<string, { count: number; resetAt: number }>();

/** Sliding-window limit for public autocomplete / geocoding (per hashed IP). */
export function checkPlacesSearchRateLimit(ip: string): { allowed: boolean } {
  const now = Date.now();
  const key = `places:${hashIp(ip)}`;
  let bucket = placesSearchHits.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + PLACES_SEARCH_WINDOW_MS };
    placesSearchHits.set(key, bucket);
  }
  if (bucket.count >= PLACES_SEARCH_MAX_PER_WINDOW) {
    return { allowed: false };
  }
  bucket.count += 1;
  return { allowed: true };
}

/** Free complete AI plans per IP before asking the guest to take a break / sign in. */
export const ANON_FREE_COMPLETE_PLANS = 3;

function quotaErrorResponse(errorKey: string): Response {
  return Response.json({ error: errorKey }, { status: 429 });
}

function userQuotaErrorKey(reason: QuotaCheck["reason"]): string {
  switch (reason) {
    case "daily_limit":
      return "error.quotaDailyLimit";
    case "one_time_used":
      return "error.quotaOneTimeUsed";
    case "expired":
      return "error.quotaExpired";
    case "no_subscription":
    default:
      return "error.quotaSignIn";
  }
}

/** Returns { allowed, plansUsed }. Anonymous users get ANON_FREE_COMPLETE_PLANS free complete plans. */
export async function checkAnonQuota(ip: string): Promise<{ allowed: boolean; plansUsed: number }> {
  const db = svc();
  if (!db) {
    logQuotaSkippedOnce();
    return { allowed: true, plansUsed: 0 };
  }
  const ipHash = hashIp(ip);
  const { data } = await db
    .from('anonymous_plan_attempts')
    .select('plan_count')
    .eq('ip_hash', ipHash)
    .maybeSingle();
  const used = data?.plan_count ?? 0;
  return { allowed: used < ANON_FREE_COMPLETE_PLANS, plansUsed: used };
}

export async function bumpAnonQuota(ip: string, userAgent?: string): Promise<void> {
  const db = svc();
  if (!db) return;
  const ipHash = hashIp(ip);
  const { data } = await db
    .from('anonymous_plan_attempts')
    .select('id,plan_count')
    .eq('ip_hash', ipHash)
    .maybeSingle();
  if (data) {
    await db
      .from('anonymous_plan_attempts')
      .update({ plan_count: (data.plan_count ?? 0) + 1, last_seen_at: new Date().toISOString() })
      .eq('id', data.id);
  } else {
    await db.from('anonymous_plan_attempts').insert({
      ip_hash: ipHash,
      plan_count: 1,
      user_agent: userAgent ?? null,
    });
  }
}

export type QuotaCheck = {
  allowed: boolean;
  reason: 'ok' | 'no_subscription' | 'expired' | 'daily_limit' | 'one_time_used' | 'one_time';
  tier: 'free' | 'one_time' | 'monthly' | 'annual';
  remaining: number;
};

export async function checkUserQuota(userId: string): Promise<QuotaCheck> {
  const db = svc();
  if (!db) {
    logQuotaSkippedOnce();
    return { allowed: true, reason: 'ok', tier: 'free', remaining: 999 };
  }

  const { data: authUser } = await db.auth.admin.getUserById(userId);
  if (hasUnlimitedAccess(authUser?.user?.email)) {
    // tier free = recordPlanGeneration won't decrement/bump usage
    return { allowed: true, reason: 'ok', tier: 'free', remaining: 999 };
  }

  const { data, error } = await db.rpc('can_user_create_plan', { _user_id: userId });
  if (error) {
    console.error('can_user_create_plan failed', error);
    return { allowed: false, reason: 'no_subscription', tier: 'free', remaining: 0 };
  }
  return data as QuotaCheck;
}

export async function bumpUserDailyUsage(userId: string): Promise<void> {
  const db = svc();
  if (!db) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from('daily_plan_usage')
    .select('id,plans_generated')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();
  if (data) {
    await db
      .from('daily_plan_usage')
      .update({ plans_generated: (data.plans_generated ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', data.id);
  } else {
    await db.from('daily_plan_usage').insert({
      user_id: userId,
      usage_date: today,
      plans_generated: 1,
    });
  }
}

/** Record a successful itinerary generation against user or anon quota. */
export async function recordPlanGeneration(
  userId: string | null,
  tier: QuotaCheck["tier"],
  request?: Request,
): Promise<void> {
  if (userId) {
    const db = svc();
    if (db) {
      const { data: authUser } = await db.auth.admin.getUserById(userId);
      if (hasUnlimitedAccess(authUser?.user?.email)) return;
    }
    if (tier === "one_time") {
      await decrementOneTimePlan(userId);
    } else if (tier === "monthly" || tier === "annual") {
      await bumpUserDailyUsage(userId);
    }
  } else if (request) {
    const ua = request.headers.get("user-agent") ?? undefined;
    await bumpAnonQuota(extractIp(request.headers), ua);
  }
  await bumpPublicPlansGenerated();
}

export type ItineraryQuotaResult =
  | { ok: true; tier: QuotaCheck["tier"] }
  | { ok: false; response: Response };

/** Enforce per-user or per-IP quota before calling Gemini. */
export async function enforceItineraryQuota(
  request: Request,
  userId: string | null,
  email?: string | null,
): Promise<ItineraryQuotaResult> {
  if (hasUnlimitedAccess(email)) {
    return { ok: true, tier: "free" };
  }

  if (userId) {
    const quota = await checkUserQuota(userId);
    if (!quota.allowed) {
      return {
        ok: false,
        response: quotaErrorResponse(userQuotaErrorKey(quota.reason)),
      };
    }
    return { ok: true, tier: quota.tier };
  }

  const anon = await checkAnonQuota(extractIp(request.headers));
  if (!anon.allowed) {
    return {
      ok: false,
      response: quotaErrorResponse("error.quotaAnonLimit"),
    };
  }
  return { ok: true, tier: "free" };
}

/** For one_time tier: decrement plans_remaining after a plan is generated. */
export async function decrementOneTimePlan(userId: string): Promise<void> {
  const db = svc();
  if (!db) return;
  const { data } = await db
    .from('subscriptions')
    .select('id,plans_remaining')
    .eq('user_id', userId)
    .eq('tier', 'one_time')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data && (data.plans_remaining ?? 0) > 0) {
    await db
      .from('subscriptions')
      .update({ plans_remaining: data.plans_remaining - 1, updated_at: new Date().toISOString() })
      .eq('id', data.id);
  }
}
