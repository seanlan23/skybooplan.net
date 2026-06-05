
ALTER TABLE public.pdf_downloads
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS runtime TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS byte_size INTEGER;

CREATE INDEX IF NOT EXISTS idx_pdf_downloads_status ON public.pdf_downloads(status);
CREATE INDEX IF NOT EXISTS idx_pdf_downloads_request_id ON public.pdf_downloads(request_id);

-- Validate enums via trigger (CHECK constraints must be immutable, but we keep this flexible)
CREATE OR REPLACE FUNCTION public.validate_pdf_download()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source IS NOT NULL
     AND NEW.source NOT IN ('trip_detail', 'trip_list', 'home', 'preview', 'email') THEN
    RAISE EXCEPTION 'Invalid pdf_downloads.source: %', NEW.source;
  END IF;

  IF NEW.status NOT IN ('success', 'failed', 'pending') THEN
    RAISE EXCEPTION 'Invalid pdf_downloads.status: %', NEW.status;
  END IF;

  IF NEW.runtime IS NOT NULL
     AND NEW.runtime NOT IN ('browser', 'ssr', 'edge', 'worker', 'unknown') THEN
    RAISE EXCEPTION 'Invalid pdf_downloads.runtime: %', NEW.runtime;
  END IF;

  RETURN NEW;
END;
$$;
