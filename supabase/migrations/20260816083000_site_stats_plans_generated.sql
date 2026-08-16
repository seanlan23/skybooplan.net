-- Public running total of completed itineraries (anon + signed-in).
-- Seeded once from existing quota / saved-plan rows; then increment-only.

CREATE TABLE IF NOT EXISTS public.site_stats (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  plans_generated bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.site_stats (id, plans_generated)
VALUES (
  1,
  COALESCE((SELECT SUM(plan_count)::bigint FROM public.anonymous_plan_attempts), 0)
  + COALESCE((SELECT COUNT(*)::bigint FROM public.travel_plans), 0)
)
ON CONFLICT (id) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.bump_plans_generated()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.site_stats
  SET plans_generated = plans_generated + 1,
      updated_at = now()
  WHERE id = 1;
$$;

REVOKE ALL ON FUNCTION public.public_plans_generated() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_plans_generated() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_plans_generated() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bump_plans_generated() TO service_role;
