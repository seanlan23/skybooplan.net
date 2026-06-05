
-- Add paid/preview flags to travel_plans
ALTER TABLE public.travel_plans
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_anonymous_preview boolean NOT NULL DEFAULT false;

-- Allow service role to manage travel_plans (for webhook updating is_paid)
DROP POLICY IF EXISTS "Service role manages travel_plans" ON public.travel_plans;
CREATE POLICY "Service role manages travel_plans"
  ON public.travel_plans FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.travel_plans TO service_role;
GRANT ALL ON public.daily_plan_usage TO service_role;
GRANT ALL ON public.anonymous_plan_attempts TO service_role;

-- Quota check helper: returns json { allowed, reason, tier, remaining }
CREATE OR REPLACE FUNCTION public.can_user_create_plan(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub RECORD;
  used int := 0;
  daily_limit int := 0;
BEGIN
  SELECT tier, status, current_period_end, plans_remaining
    INTO sub
    FROM public.subscriptions
    WHERE user_id = _user_id
    ORDER BY updated_at DESC
    LIMIT 1;

  IF sub IS NULL OR sub.tier = 'free' OR sub.status <> 'active' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'no_subscription', 'tier', 'free', 'remaining', 0);
  END IF;

  IF sub.current_period_end IS NOT NULL AND sub.current_period_end < now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'expired', 'tier', sub.tier, 'remaining', 0);
  END IF;

  IF sub.tier = 'one_time' THEN
    IF COALESCE(sub.plans_remaining, 0) > 0 THEN
      RETURN jsonb_build_object('allowed', true, 'reason', 'one_time', 'tier', 'one_time', 'remaining', sub.plans_remaining);
    ELSE
      RETURN jsonb_build_object('allowed', false, 'reason', 'one_time_used', 'tier', 'one_time', 'remaining', 0);
    END IF;
  END IF;

  -- monthly / annual: 2 per day
  daily_limit := 2;
  SELECT COALESCE(plans_generated, 0) INTO used
    FROM public.daily_plan_usage
    WHERE user_id = _user_id AND usage_date = CURRENT_DATE;

  IF used >= daily_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'daily_limit', 'tier', sub.tier, 'remaining', 0);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok', 'tier', sub.tier, 'remaining', daily_limit - used);
END;
$$;
