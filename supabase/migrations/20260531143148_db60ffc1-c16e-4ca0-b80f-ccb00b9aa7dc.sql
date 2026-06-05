CREATE TABLE public.webhook_replay_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_event_id uuid NOT NULL,
  replay_event_id uuid,
  replayed_by uuid NOT NULL,
  target_user_id uuid,
  environment text NOT NULL,
  outcome text NOT NULL,
  error_message text,
  before_state jsonb,
  after_state jsonb,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_replay_audits_original ON public.webhook_replay_audits(original_event_id);
CREATE INDEX idx_replay_audits_created_at ON public.webhook_replay_audits(created_at DESC);

GRANT SELECT ON public.webhook_replay_audits TO authenticated;
GRANT ALL ON public.webhook_replay_audits TO service_role;

ALTER TABLE public.webhook_replay_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view replay audits"
  ON public.webhook_replay_audits FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages replay audits"
  ON public.webhook_replay_audits FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);