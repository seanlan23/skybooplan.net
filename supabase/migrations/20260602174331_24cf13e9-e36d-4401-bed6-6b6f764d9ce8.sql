
-- Restrictive policies: block any writes by anon/authenticated to user_roles
CREATE POLICY "Deny non-service writes to user_roles ins"
ON public.user_roles AS RESTRICTIVE
FOR INSERT TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Deny non-service writes to user_roles upd"
ON public.user_roles AS RESTRICTIVE
FOR UPDATE TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "Deny non-service writes to user_roles del"
ON public.user_roles AS RESTRICTIVE
FOR DELETE TO anon, authenticated
USING (false);

-- Same for anonymous_plan_attempts (PII-adjacent, service role only)
CREATE POLICY "Deny non-service reads anon_plan_attempts"
ON public.anonymous_plan_attempts AS RESTRICTIVE
FOR SELECT TO anon, authenticated
USING (false);

CREATE POLICY "Deny non-service writes anon_plan_attempts ins"
ON public.anonymous_plan_attempts AS RESTRICTIVE
FOR INSERT TO anon, authenticated
WITH CHECK (false);

CREATE POLICY "Deny non-service writes anon_plan_attempts upd"
ON public.anonymous_plan_attempts AS RESTRICTIVE
FOR UPDATE TO anon, authenticated
USING (false) WITH CHECK (false);

CREATE POLICY "Deny non-service writes anon_plan_attempts del"
ON public.anonymous_plan_attempts AS RESTRICTIVE
FOR DELETE TO anon, authenticated
USING (false);

-- Revoke EXECUTE from authenticated/anon on SECURITY DEFINER functions
-- that should NOT be callable directly by signed-in users.
-- handle_new_user is a trigger function on auth.users; no direct calls needed.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- update_updated_at_column is a trigger function; no direct calls.
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
-- can_user_create_plan is called by server (service role) only.
REVOKE EXECUTE ON FUNCTION public.can_user_create_plan(uuid) FROM PUBLIC, anon, authenticated;

-- has_role MUST remain executable by authenticated (used inside RLS policies),
-- but revoke from anon since no anon policy uses it.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
