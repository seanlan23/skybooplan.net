
-- 1) Force RLS so even table owners obey policies
ALTER TABLE public.pdf_downloads FORCE ROW LEVEL SECURITY;

-- 2) Tighten user INSERT policy: must own the plan
DROP POLICY IF EXISTS "Users insert own pdf downloads" ON public.pdf_downloads;
CREATE POLICY "Users insert own pdf downloads"
ON public.pdf_downloads
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.travel_plans tp
    WHERE tp.id = pdf_downloads.plan_id
      AND tp.user_id = auth.uid()
  )
);

-- 3) Explicit hard deny for anon (defence in depth alongside missing GRANT)
CREATE POLICY "Deny anon read pdf_downloads"
ON public.pdf_downloads
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

CREATE POLICY "Deny anon write pdf_downloads"
ON public.pdf_downloads
AS RESTRICTIVE
FOR INSERT
TO anon
WITH CHECK (false);

-- 4) Restrict source values to a known set (validation trigger, not CHECK,
--    so it stays flexible if we extend it later)
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_pdf_download_trg ON public.pdf_downloads;
CREATE TRIGGER validate_pdf_download_trg
BEFORE INSERT OR UPDATE ON public.pdf_downloads
FOR EACH ROW
EXECUTE FUNCTION public.validate_pdf_download();

-- 5) Make sure no stray anon privilege ever leaks in
REVOKE ALL ON public.pdf_downloads FROM anon;
