
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS price_id text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_env
  ON public.subscriptions(user_id, environment);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON public.subscriptions(stripe_subscription_id);

-- Allow service role (webhook handler) full access
DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.subscriptions;
CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
