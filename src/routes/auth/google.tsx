import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Logo, LogoMark } from "@/components/Logo";
import { googleAuthCallbackUrl } from "@/lib/auth.urls";
import { supabase } from "@/integrations/supabase/client";
import { withSupabaseApiKey } from "@/lib/supabasePublic";
import { readStoredLang, translate, useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth/google")({
  validateSearch: (search: Record<string, unknown>) => ({
    callbackUrl:
      typeof search.callbackUrl === "string" ? search.callbackUrl : undefined,
  }),
  head: () => {
    const lang = readStoredLang();
    return {
      meta: [{ title: translate(lang, "auth.googleMetaTitle") }],
    };
  },
  component: GoogleAuthStartPage,
});

/** Branded handoff → Supabase Google OAuth (full navigation, Safari-safe). */
function GoogleAuthStartPage() {
  const { callbackUrl } = Route.useSearch();
  const t = useT();
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let redirectTo = googleAuthCallbackUrl();
    if (callbackUrl?.startsWith("http")) {
      try {
        if (new URL(callbackUrl).origin === window.location.origin) {
          redirectTo = callbackUrl;
        }
      } catch {
        /* keep default */
      }
    }

    (async () => {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
          },
        },
      });

      if (oauthError || !data?.url) {
        console.error("[auth/google] oauth:", oauthError?.message);
        setError(t("auth.googleBridgeFailed"));
        return;
      }

      // Full-page redirect cannot send apikey headers — put it on the URL.
      window.location.assign(withSupabaseApiKey(data.url));
    })();
  }, [callbackUrl, t]);

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
          {error ? t("auth.failedTitle") : t("auth.connectingGoogle")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {error || t("auth.connectingGoogleSub")}
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
        <p className="mt-6 text-xs text-slate-500">
          Travel planner · <span className="font-semibold text-sky-700">skybooplan</span>
        </p>
      </div>
    </div>
  );
}
