-- Share links must work on Vercel without SUPABASE_SERVICE_ROLE_KEY.
-- Guests and Facebook crawlers only need SELECT; Deli paket needs INSERT.

GRANT SELECT, INSERT ON public.shared_packages TO anon, authenticated;

DROP POLICY IF EXISTS "Public can read shared_packages" ON public.shared_packages;
CREATE POLICY "Public can read shared_packages"
  ON public.shared_packages FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public can insert shared_packages" ON public.shared_packages;
CREATE POLICY "Public can insert shared_packages"
  ON public.shared_packages FOR INSERT TO anon, authenticated
  WITH CHECK (id ~ '^[a-zA-Z0-9_-]{6,32}$' AND char_length(og_title) > 0);
