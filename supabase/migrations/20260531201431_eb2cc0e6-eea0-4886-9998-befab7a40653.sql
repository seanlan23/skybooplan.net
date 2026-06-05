
REVOKE EXECUTE ON FUNCTION public.can_user_create_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_user_create_plan(uuid) TO service_role;

DROP POLICY IF EXISTS "Service role manages anon attempts" ON public.anonymous_plan_attempts;
CREATE POLICY "Service role manages anon attempts"
  ON public.anonymous_plan_attempts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages daily usage" ON public.daily_plan_usage;
CREATE POLICY "Service role manages daily usage"
  ON public.daily_plan_usage FOR ALL TO service_role
  USING (true) WITH CHECK (true);
