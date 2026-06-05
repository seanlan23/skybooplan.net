import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  dispatchWebhookEvent,
  getServiceSupabase,
  logEventReceived,
  markEvent,
} from './webhooks.server';
import type { StripeEnv } from './stripe.server';

// Subset of subscription fields we care about for the audit diff.
const TRACKED_FIELDS = [
  'tier',
  'status',
  'plans_remaining',
  'stripe_subscription_id',
  'current_period_start',
  'current_period_end',
  'cancel_at_period_end',
  'price_id',
  'price_amount',
] as const;

type SubSnapshot = Record<string, any>;

async function snapshotSubscriptions(
  adminClient: any,
  targetUserId: string | null,
  env: StripeEnv,
): Promise<SubSnapshot[]> {
  if (!targetUserId) return [];
  const { data, error } = await adminClient
    .from('subscriptions')
    .select(TRACKED_FIELDS.join(','))
    .eq('user_id', targetUserId)
    .eq('environment', env)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to snapshot subscriptions:', error);
    return [];
  }
  return data ?? [];
}

function computeDiff(before: SubSnapshot[], after: SubSnapshot[]) {
  // Key snapshots by stripe_subscription_id (the stable identifier we set).
  const keyOf = (row: SubSnapshot) => row.stripe_subscription_id ?? '(no_id)';
  const beforeMap = new Map(before.map((r) => [keyOf(r), r]));
  const afterMap = new Map(after.map((r) => [keyOf(r), r]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);

  const changes: Array<{
    stripe_subscription_id: string;
    kind: 'added' | 'removed' | 'changed' | 'unchanged';
    fields?: Record<string, { before: any; after: any }>;
  }> = [];

  for (const key of keys) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (!b && a) {
      changes.push({ stripe_subscription_id: key, kind: 'added', fields: Object.fromEntries(
        TRACKED_FIELDS.map((f) => [f, { before: null, after: a[f] ?? null }]),
      ) });
    } else if (b && !a) {
      changes.push({ stripe_subscription_id: key, kind: 'removed' });
    } else if (b && a) {
      const fieldDiff: Record<string, { before: any; after: any }> = {};
      for (const f of TRACKED_FIELDS) {
        if (JSON.stringify(b[f] ?? null) !== JSON.stringify(a[f] ?? null)) {
          fieldDiff[f] = { before: b[f] ?? null, after: a[f] ?? null };
        }
      }
      if (Object.keys(fieldDiff).length > 0) {
        changes.push({ stripe_subscription_id: key, kind: 'changed', fields: fieldDiff });
      } else {
        changes.push({ stripe_subscription_id: key, kind: 'unchanged' });
      }
    }
  }
  return changes;
}

export const replayWebhookEvent = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ eventId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Verify caller is admin
    const { data: roleRow, error: roleErr } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleErr || !roleRow) {
      throw new Error('Forbidden: admin role required');
    }

    const admin = getServiceSupabase();
    const { data: original, error: loadErr } = await admin
      .from('webhook_events')
      .select('*')
      .eq('id', data.eventId)
      .single();
    if (loadErr || !original) {
      throw new Error('Webhook event not found');
    }

    const env = original.environment as StripeEnv;
    const payload = original.payload_masked;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Stored payload is missing or invalid');
    }

    const targetUserId: string | null = original.user_id ?? null;

    // 1) Snapshot BEFORE
    const beforeState = await snapshotSubscriptions(admin, targetUserId, env);

    // 2) Log a NEW webhook_event row and run dispatch
    const newLogId = await logEventReceived(payload, env, 'replay');
    let outcome: 'processed' | 'ignored' | 'failed' = 'failed';
    let errorMessage: string | null = null;
    try {
      outcome = await dispatchWebhookEvent(payload, env);
      await markEvent(newLogId, outcome);
    } catch (e: any) {
      errorMessage = e?.message ?? String(e);
      await markEvent(newLogId, 'failed', errorMessage ?? undefined);
      outcome = 'failed';
    }

    // 3) Snapshot AFTER + compute diff
    const afterState = await snapshotSubscriptions(admin, targetUserId, env);
    const diff = computeDiff(beforeState, afterState);

    // 4) Persist audit row
    const { error: auditErr } = await admin.from('webhook_replay_audits').insert({
      original_event_id: data.eventId,
      replay_event_id: newLogId,
      replayed_by: userId,
      target_user_id: targetUserId,
      environment: env,
      outcome,
      error_message: errorMessage,
      before_state: beforeState,
      after_state: afterState,
      diff,
    });
    if (auditErr) {
      console.error('Failed to write replay audit:', auditErr);
    }

    return {
      ok: outcome !== 'failed',
      newEventId: newLogId,
      outcome,
      error: errorMessage ?? undefined,
      diff,
    };
  });
