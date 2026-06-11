import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

let _supabase: any = null;
function svc() {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return _supabase;
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

/** Returns { allowed, plansUsed }. Anonymous users get exactly 1 free plan. */
export async function checkAnonQuota(ip: string): Promise<{ allowed: boolean; plansUsed: number }> {
  const ipHash = hashIp(ip);
  const { data } = await svc()
    .from('anonymous_plan_attempts')
    .select('plan_count')
    .eq('ip_hash', ipHash)
    .maybeSingle();
  const used = data?.plan_count ?? 0;
  return { allowed: used < 1, plansUsed: used };
}

export async function bumpAnonQuota(ip: string, userAgent?: string): Promise<void> {
  const ipHash = hashIp(ip);
  const { data } = await svc()
    .from('anonymous_plan_attempts')
    .select('id,plan_count')
    .eq('ip_hash', ipHash)
    .maybeSingle();
  if (data) {
    await svc()
      .from('anonymous_plan_attempts')
      .update({ plan_count: (data.plan_count ?? 0) + 1, last_seen_at: new Date().toISOString() })
      .eq('id', data.id);
  } else {
    await svc().from('anonymous_plan_attempts').insert({
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
  const { data, error } = await svc().rpc('can_user_create_plan', { _user_id: userId });
  if (error) {
    console.error('can_user_create_plan failed', error);
    return { allowed: false, reason: 'no_subscription', tier: 'free', remaining: 0 };
  }
  return data as QuotaCheck;
}

export async function bumpUserDailyUsage(userId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await svc()
    .from('daily_plan_usage')
    .select('id,plans_generated')
    .eq('user_id', userId)
    .eq('usage_date', today)
    .maybeSingle();
  if (data) {
    await svc()
      .from('daily_plan_usage')
      .update({ plans_generated: (data.plans_generated ?? 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', data.id);
  } else {
    await svc().from('daily_plan_usage').insert({
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
    if (tier === "one_time") {
      await decrementOneTimePlan(userId);
    } else if (tier === "monthly" || tier === "annual") {
      await bumpUserDailyUsage(userId);
    }
    return;
  }
  if (request) {
    const ua = request.headers.get("user-agent") ?? undefined;
    await bumpAnonQuota(extractIp(request.headers), ua);
  }
}

export type ItineraryQuotaResult =
  | { ok: true; tier: QuotaCheck["tier"] }
  | { ok: false; response: Response };

/** Enforce per-user or per-IP quota before calling Gemini. */
export async function enforceItineraryQuota(
  request: Request,
  userId: string | null,
): Promise<ItineraryQuotaResult> {
  if (userId) {
    const quota = await checkUserQuota(userId);
    if (!quota.allowed) {
      return {
        ok: false,
        response: Response.json({ error: "Quota exceeded" }, { status: 429 }),
      };
    }
    return { ok: true, tier: quota.tier };
  }

  const anon = await checkAnonQuota(extractIp(request.headers));
  if (!anon.allowed) {
    return {
      ok: false,
      response: Response.json({ error: "Quota exceeded" }, { status: 429 }),
    };
  }
  return { ok: true, tier: "free" };
}

/** For one_time tier: decrement plans_remaining after a plan is generated. */
export async function decrementOneTimePlan(userId: string): Promise<void> {
  const { data } = await svc()
    .from('subscriptions')
    .select('id,plans_remaining')
    .eq('user_id', userId)
    .eq('tier', 'one_time')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data && (data.plans_remaining ?? 0) > 0) {
    await svc()
      .from('subscriptions')
      .update({ plans_remaining: data.plans_remaining - 1, updated_at: new Date().toISOString() })
      .eq('id', data.id);
  }
}
