-- Public share snapshots for Facebook / social package links.
CREATE TABLE IF NOT EXISTS public.shared_packages (
  id text PRIMARY KEY,
  payload jsonb NOT NULL,
  og_title text NOT NULL,
  og_description text NOT NULL,
  og_image text,
  from_iata text,
  to_iata text,
  depart_date date,
  return_date date,
  trip_style text,
  hotel_id text,
  guests integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shared_packages_created_at
  ON public.shared_packages (created_at DESC);

ALTER TABLE public.shared_packages ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.shared_packages TO service_role;

DROP POLICY IF EXISTS "Service role manages shared_packages" ON public.shared_packages;
CREATE POLICY "Service role manages shared_packages"
  ON public.shared_packages FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
