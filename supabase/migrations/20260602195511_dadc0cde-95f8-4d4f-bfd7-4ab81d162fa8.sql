
CREATE TABLE public.pdf_downloads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.travel_plans(id) ON DELETE CASCADE,
  downloaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_agent TEXT,
  ip_hash TEXT,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdf_downloads_user_id ON public.pdf_downloads(user_id);
CREATE INDEX idx_pdf_downloads_plan_id ON public.pdf_downloads(plan_id);
CREATE INDEX idx_pdf_downloads_downloaded_at ON public.pdf_downloads(downloaded_at DESC);

GRANT SELECT, INSERT ON public.pdf_downloads TO authenticated;
GRANT ALL ON public.pdf_downloads TO service_role;

ALTER TABLE public.pdf_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own pdf downloads"
ON public.pdf_downloads
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own pdf downloads"
ON public.pdf_downloads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all pdf downloads"
ON public.pdf_downloads
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages pdf_downloads"
ON public.pdf_downloads
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
