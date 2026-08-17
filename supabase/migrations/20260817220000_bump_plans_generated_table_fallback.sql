-- Keep the public counter incrementing even when the previous RPC was missing.
-- Never write a lower value over a higher one.

CREATE TABLE IF NOT EXISTS public.site_stats (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  plans_generated bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_stats ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.public_plans_generated()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT plans_generated FROM public.site_stats WHERE id = 1), 0);
$$;

CREATE OR REPLACE FUNCTION public.live_plans_generated_sum()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(plan_count)::bigint FROM public.anonymous_plan_attempts), 0)
    + COALESCE((SELECT SUM(plans_generated)::bigint FROM public.daily_plan_usage), 0);
$$;

CREATE OR REPLACE FUNCTION public.bump_plans_generated()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_count bigint;
BEGIN
  INSERT INTO public.site_stats (id, plans_generated)
  VALUES (1, 178)
  ON CONFLICT (id) DO UPDATE
  SET plans_generated = GREATEST(public.site_stats.plans_generated, 177) + 1,
      updated_at = now()
  RETURNING plans_generated INTO next_count;
  RETURN next_count;
END;
$$;

INSERT INTO public.site_stats (id, plans_generated)
VALUES (1, 177)
ON CONFLICT (id) DO UPDATE
SET plans_generated = GREATEST(public.site_stats.plans_generated, EXCLUDED.plans_generated),
    updated_at = now();

REVOKE ALL ON FUNCTION public.public_plans_generated() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.live_plans_generated_sum() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_plans_generated() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_plans_generated() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.live_plans_generated_sum() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bump_plans_generated() TO service_role;
