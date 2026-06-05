-- Global place cache for Google Places API results
CREATE TABLE public.place_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  place_query TEXT NOT NULL UNIQUE,
  place_name TEXT,
  google_place_id TEXT,
  photo_url TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  formatted_address TEXT,
  country_code TEXT,
  not_found BOOLEAN NOT NULL DEFAULT false,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '180 days')
);

CREATE INDEX idx_place_cache_query ON public.place_cache(place_query);
CREATE INDEX idx_place_cache_expires ON public.place_cache(expires_at);

-- Grants: public read (so frontend can render cached images), server-only write
GRANT SELECT ON public.place_cache TO anon, authenticated;
GRANT ALL ON public.place_cache TO service_role;

ALTER TABLE public.place_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read cached places (non-sensitive, public info)
CREATE POLICY "Anyone can read place cache"
ON public.place_cache
FOR SELECT
USING (true);

-- Only service role writes (no policy needed; service_role bypasses RLS)
