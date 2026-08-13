import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

function isRouterRedirect(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "isRedirect" in error &&
      (error as { isRedirect?: boolean }).isRedirect,
  );
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // Supabase session lives in localStorage — SSR has no user; skip gate on server.
    if (typeof window === "undefined") return;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        throw redirect({ to: "/login" });
      }
    } catch (error) {
      if (isRouterRedirect(error)) throw error;
      console.error("[auth] session check failed", error);
      throw redirect({ to: "/login" });
    }
  },
  component: () => <Outlet />,
});
