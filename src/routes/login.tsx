import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { googleSignInHref } from "@/lib/auth.urls";
import { GoogleIcon } from "@/components/GoogleIcon";
import { useAuth } from "@/hooks/use-auth";
import { readStoredLang, translate, useT } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  head: () => {
    const lang = readStoredLang();
    return {
      meta: [
        { title: translate(lang, "auth.loginMetaTitle") },
        { name: "description", content: translate(lang, "auth.loginSub") },
      ],
    };
  },
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useT();

  useEffect(() => {
    if (user) navigate({ to: "/", replace: true });
  }, [user, navigate]);

  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (err === "csrf" || err === "google") {
      toast.error(t("auth.googleBridgeFailed"));
    }
  }, [t]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const msg = /load failed|failed to fetch/i.test(error.message)
        ? t("auth.googleBridgeFailed")
        : error.message;
      toast.error(msg);
    } else toast.success(t("auth.welcomeToast"));
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6"
      style={{
        background:
          "linear-gradient(165deg, oklch(0.99 0.01 240) 0%, oklch(0.96 0.04 235) 42%, oklch(0.98 0.03 70) 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center text-slate-900">
          <Logo size="md" />
        </Link>

        <div className="rounded-[28px] border border-sky-200/60 bg-white p-8 shadow-[0_18px_40px_rgba(2,132,199,0.1)]">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t("auth.welcomeBack")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t("auth.loginSub")}</p>

          <a
            href={googleSignInHref()}
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 py-3 text-sm font-semibold text-slate-800 transition-colors hover:border-sky-300 hover:bg-sky-50"
          >
            <GoogleIcon /> {t("nav.signInGoogle")}
          </a>

          <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-sky-100" /> {t("auth.or")}{" "}
            <div className="h-px flex-1 bg-sky-100" />
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <Field
              icon={Mail}
              type="email"
              placeholder={t("auth.emailPh")}
              value={email}
              onChange={setEmail}
            />
            <Field
              icon={Lock}
              type="password"
              placeholder={t("auth.passwordPh")}
              value={password}
              onChange={setPassword}
            />
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #0EA5E9, #0284C7)" }}
            >
              {t("auth.signInBtn")} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link to="/reset-password" className="text-slate-500 hover:text-slate-800">
              {t("auth.forgot")}
            </Link>
            <Link to="/signup" className="font-semibold text-sky-600 hover:underline">
              {t("auth.createAccount")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  type,
  placeholder,
  value,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-400" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-sky-100 bg-slate-50/80 py-3 pl-11 pr-4 text-[15px] text-slate-900 placeholder:text-slate-400 transition-colors focus:border-sky-400 focus:bg-white focus:outline-none"
      />
    </div>
  );
}
