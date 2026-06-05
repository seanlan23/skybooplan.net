CREATE TABLE public.flight_searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  depart_date DATE NOT NULL,
  return_date DATE,
  pax INTEGER NOT NULL DEFAULT 1,
  cabin_class TEXT,
  results_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.flight_searches TO authenticated;
GRANT ALL ON public.flight_searches TO service_role;

ALTER TABLE public.flight_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own searches"
ON public.flight_searches FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own searches"
ON public.flight_searches FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own searches"
ON public.flight_searches FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_flight_searches_user_created ON public.flight_searches(user_id, created_at DESC);