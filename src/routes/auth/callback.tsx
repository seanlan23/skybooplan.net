import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Logo, LogoMark } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Prijava — skybooplan" }] }),
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
      try {
        const res = await fetch("/api/auth/complete-google", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          session?: { access_token: string; refresh_token: string };
        };

        if (!res.ok || !data.ok || !data.session) {
          const message = t("auth.googleBridgeFailed");
          setError(message);
          toast.error(message);
          window.setTimeout(() => navigate({ to: "/login", replace: true }), 1600);
          return;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (sessionError) {
          const message = t("auth.googleBridgeFailed");
          setError(message);
          toast.error(message);
          window.setTimeout(() => navigate({ to: "/login", replace: true }), 1600);
          return;
        }

        toast.success(t("auth.welcomeToast"));
        navigate({ to: "/dashboard", replace: true });
      } catch {
        const message = t("auth.googleBridgeFailed");
        setError(message);
        toast.error(message);
        window.setTimeout(() => navigate({ to: "/login", replace: true }), 1600);
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
          {error ? "Prijava ni uspela" : "Dokončujem prijavo"}
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
            Nazaj na prijavo
          </Link>
        )}
      </div>
    </div>
  );
}
