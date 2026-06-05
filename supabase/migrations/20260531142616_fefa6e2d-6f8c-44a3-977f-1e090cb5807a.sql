CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_event_id TEXT UNIQUE,
  event_type TEXT NOT NULL,
  environment TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  payload_masked JSONB,
  user_id UUID,
  stripe_object_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_webhook_events_created_at ON public.webhook_events(created_at DESC);
CREATE INDEX idx_webhook_events_event_type ON public.webhook_events(event_type);
CREATE INDEX idx_webhook_events_status ON public.webhook_events(status);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all webhook events"
ON public.webhook_events
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages webhook events"
ON public.webhook_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);