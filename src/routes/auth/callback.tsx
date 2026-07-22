import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Logo, LogoMark } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { readStoredLang, translate, useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth/callback")({
  head: () => {
    const lang = readStoredLang();
    return {
      meta: [{ title: translate(lang, "auth.callbackMetaTitle") }],
    };
  },
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const t = useT();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const fail = (message: string) => {
        setError(message);
        toast.error(message);
        window.setTimeout(() => navigate({ to: "/login", replace: true }), 1800);
      };

      try {
        const url = new URL(window.location.href);
        const oauthError =
          url.searchParams.get("error_description") ||
          url.searchParams.get("error");
        if (oauthError) {
          fail(t("auth.googleBridgeFailed"));
          return;
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            console.error("[auth/callback] exchange:", exchangeError.message);
            fail(t("auth.googleBridgeFailed"));
            return;
          }
        } else {
          // Hash tokens / detectSessionInUrl may already have a session.
          const { data, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !data.session) {
            // Legacy Auth.js cookie path (if still used).
            const bridge = await fetch("/api/auth/complete-google", {
              credentials: "same-origin",
              headers: { Accept: "application/json" },
            });
            const payload = (await bridge.json().catch(() => null)) as {
              ok?: boolean;
              session?: { access_token: string; refresh_token: string };
            } | null;

            if (bridge.ok && payload?.ok && payload.session) {
              const { error: setErr } = await supabase.auth.setSession({
                access_token: payload.session.access_token,
                refresh_token: payload.session.refresh_token,
              });
              if (setErr) {
                fail(t("auth.googleBridgeFailed"));
                return;
              }
            } else {
              fail(t("auth.googleBridgeFailed"));
              return;
            }
          }
        }

        toast.success(t("auth.welcomeToast"));
        navigate({ to: "/dashboard", replace: true });
      } catch (e) {
        console.error("[auth/callback] failed:", e);
        fail(t("auth.googleBridgeFailed"));
      }
    })();
  }, [navigate, t]);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{
        background:
          "linear-gradient(165deg, oklch(0.99 0.01 240) 0%, oklch(0.96 0.04 235) 42%, oklch(0.98 0.03 70) 100%)",
      }}
    >
      <div className="w-full max-w-sm rounded-[28px] border border-sky-200/60 bg-white px-8 py-10 text-center shadow-[0_18px_40px_rgba(2,132,199,0.1)]">
        <Link to="/" className="mb-6 inline-flex justify-center" aria-label="skybooplan">
          <Logo size="md" />
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">
          {error ? t("auth.failedTitle") : t("auth.completingTitle")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {error || t("auth.completingSignIn")}
        </p>
        {!error ? (
          <div
            className="relative mx-auto mt-8 grid h-16 w-16 place-items-center rounded-full"
            style={{
              background:
                "linear-gradient(145deg, rgba(14,165,233,0.12), rgba(244,162,97,0.16))",
            }}
            aria-hidden
          >
            <span className="absolute inset-[-4px] animate-spin rounded-full border-2 border-transparent border-t-sky-500 border-r-orange-400" />
            <LogoMark size={28} />
          </div>
        ) : (
          <Link
            to="/login"
            className="mt-6 inline-flex rounded-2xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #0EA5E9, #0284C7)" }}
          >
            {t("auth.backToLogin")}
          </Link>
        )}
      </div>
    </div>
  );
}
