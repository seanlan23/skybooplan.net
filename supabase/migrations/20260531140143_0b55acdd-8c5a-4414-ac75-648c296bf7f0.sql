
-- ===== Anonymous IP-based quota tracking =====
CREATE TABLE public.anonymous_plan_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL UNIQUE,
  user_agent text,
  plan_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Service-role only — no client access at all
GRANT ALL ON public.anonymous_plan_attempts TO service_role;

ALTER TABLE public.anonymous_plan_attempts ENABLE ROW LEVEL SECURITY;

-- No policies → no authenticated/anon access. Server fns use service-role.

CREATE INDEX idx_anon_attempts_last_seen ON public.anonymous_plan_attempts(last_seen_at DESC);


-- ===== daily_plan_usage: allow user inserts/updates via server fn (service role) =====
-- Already has SELECT for own rows. Server fn writes use service role and bypass RLS,
-- so no additional policy needed.


-- ===== Tighten subscription_tier enum: remove 'yearly' =====
-- Remove all rows that use the value first (none expected at this point)
DELETE FROM public.subscriptions WHERE tier = 'yearly';

-- Rebuild enum without 'yearly'
ALTER TYPE public.subscription_tier RENAME TO subscription_tier_old;
CREATE TYPE public.subscription_tier AS ENUM ('free', 'one_time', 'monthly');

ALTER TABLE public.subscriptions
  ALTER COLUMN tier DROP DEFAULT,
  ALTER COLUMN tier TYPE public.subscription_tier
    USING tier::text::public.subscription_tier,
  ALTER COLUMN tier SET DEFAULT 'free'::public.subscription_tier;

ALTER TABLE public.profiles
  ALTER COLUMN preferred_currency DROP DEFAULT,
  ALTER COLUMN preferred_currency SET DEFAULT 'EUR'::public.currency_code;

DROP TYPE public.subscription_tier_old;


-- ===== Track one-time purchase consumption on subscriptions row =====
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plans_remaining integer;
-- For one_time tier: starts at 1, decremented to 0 after the plan is downloaded.
-- For monthly: NULL (uses daily_plan_usage instead).
