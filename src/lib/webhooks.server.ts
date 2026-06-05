import { createClient } from '@supabase/supabase-js';
import type { StripeEnv } from '@/lib/stripe.server';

let _supabase: any = null;
export function getServiceSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return _supabase;
}

function priceIdToTier(priceId: string | undefined): 'one_time' | 'monthly' | 'annual' | 'free' {
  if (priceId === 'single_plan_eur') return 'one_time';
  if (priceId === 'monthly_eur') return 'monthly';
  if (priceId === 'annual_eur') return 'annual';
  return 'free';
}

const SENSITIVE_KEYS = new Set([
  'email', 'customer_email', 'receipt_email', 'name', 'phone', 'address',
  'shipping', 'billing_details', 'payment_method', 'payment_method_details',
  'card', 'last4', 'fingerprint', 'tax_id', 'tax_ids', 'ip_address', 'client_secret',
]);

export function maskPayload(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(maskPayload);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k)) out[k] = '***masked***';
      else out[k] = maskPayload(v);
    }
    return out;
  }
  return value;
}

async function handleSubscriptionUpsert(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) throw new Error('No userId in subscription metadata');
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getServiceSupabase().from('subscriptions').upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      tier: priceIdToTier(priceId),
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      price_amount: item?.price?.unit_amount ? item.price.unit_amount / 100 : null,
      price_currency: (item?.price?.currency || 'eur').toUpperCase(),
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_subscription_id' },
  );
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await getServiceSupabase()
    .from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', subscription.id)
    .eq('environment', env);
}

async function handleOneTimePayment(session: any, env: StripeEnv) {
  const userId = session.metadata?.userId;
  if (!userId) throw new Error('No userId in checkout session metadata');
  await getServiceSupabase().from('subscriptions').insert({
    user_id: userId,
    stripe_subscription_id: `onetime_${session.id}`,
    stripe_customer_id: session.customer,
    tier: 'one_time',
    status: 'active',
    plans_remaining: 1,
    price_amount: session.amount_total ? session.amount_total / 100 : null,
    price_currency: (session.currency || 'eur').toUpperCase(),
    environment: env,
  });
}

export async function dispatchWebhookEvent(event: any, env: StripeEnv): Promise<'processed' | 'ignored'> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionUpsert(event.data.object, env);
      return 'processed';
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object, env);
      return 'processed';
    case 'checkout.session.completed': {
      const session: any = event.data.object;
      if (session.mode === 'payment') {
        await handleOneTimePayment(session, env);
        return 'processed';
      }
      return 'ignored';
    }
    default:
      return 'ignored';
  }
}

function extractContext(event: any): { userId?: string; stripeObjectId?: string } {
  const obj = event?.data?.object || {};
  return { userId: obj?.metadata?.userId, stripeObjectId: obj?.id };
}

export async function logEventReceived(event: any, env: StripeEnv, sourceTag?: string): Promise<string | null> {
  const { userId, stripeObjectId } = extractContext(event);
  const { data, error } = await getServiceSupabase()
    .from('webhook_events')
    .insert({
      stripe_event_id: sourceTag ? `${sourceTag}:${event.id}` : event.id,
      event_type: sourceTag ? `${sourceTag}:${event.type}` : event.type,
      environment: env,
      status: 'received',
      payload_masked: maskPayload(event),
      user_id: userId ?? null,
      stripe_object_id: stripeObjectId ?? null,
    })
    .select('id')
    .single();
  if (error) {
    console.error('Failed to log webhook event:', error);
    return null;
  }
  return data?.id ?? null;
}

export async function markEvent(id: string | null, status: 'processed' | 'failed' | 'ignored', errorMessage?: string) {
  if (!id) return;
  await getServiceSupabase()
    .from('webhook_events')
    .update({
      status,
      error_message: errorMessage ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);
}
