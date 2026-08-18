-- Raise the public itinerary floor to 204 without ever decreasing a higher value.

INSERT INTO public.site_stats (id, plans_generated)
VALUES (1, 204)
ON CONFLICT (id) DO UPDATE
SET plans_generated = GREATEST(public.site_stats.plans_generated, 204),
    updated_at = now();

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
  VALUES (1, 205)
  ON CONFLICT (id) DO UPDATE
  SET plans_generated = GREATEST(public.site_stats.plans_generated, 204) + 1,
      updated_at = now()
  RETURNING plans_generated INTO next_count;
  RETURN next_count;
END;
$$;
