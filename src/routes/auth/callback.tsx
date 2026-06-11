import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchGoogleIdToken } from "@/lib/auth.bridge";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Signing in — Skybooplan" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const t = useT();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const result = await fetchGoogleIdToken();
      if (!result.ok) {
        toast.error(t("auth.googleBridgeFailed"));
        navigate({ to: "/login", replace: true });
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: result.id_token,
      });

      if (error) {
        toast.error(error.message);
        navigate({ to: "/login", replace: true });
        return;
      }

      toast.success(t("auth.welcomeToast"));
      navigate({ to: "/dashboard", replace: true });
    })();
  }, [navigate, t]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-3"
      style={{ background: "var(--gradient-hero)" }}
    >
      <Loader2 className="h-8 w-8 animate-spin text-brand" />
      <p className="text-sm text-muted-foreground">{t("auth.completingSignIn")}</p>
    </div>
  );
}
