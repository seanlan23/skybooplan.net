import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plane, Mail, Lock, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Skybooplan" },
      { name: "description", content: "Sign in to access your travel plans and saved trips." },
    ],
  }),
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

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success(t("auth.welcomeToast"));
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error(result.error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--gradient-hero)" }}>
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-8 text-foreground">
          <Plane className="h-6 w-6 text-brand" />
          <span className="font-bold text-xl">Skybooplan</span>
        </Link>

        <div className="rounded-3xl bg-card border border-border shadow-[var(--shadow-card)] p-8">
          <h1 className="text-2xl font-bold text-foreground">{t("auth.welcomeBack")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.loginSub")}</p>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="mt-6 w-full inline-flex items-center justify-center gap-3 rounded-2xl border border-border bg-background py-3 text-sm font-semibold hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <GoogleIcon /> {t("auth.continueGoogle")}
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> {t("auth.or")} <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <Field icon={Mail} type="email" placeholder={t("auth.emailPh")} value={email} onChange={setEmail} />
            <Field icon={Lock} type="password" placeholder={t("auth.passwordPh")} value={password} onChange={setPassword} />
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-primary-foreground shadow-md transition-all hover:shadow-lg disabled:opacity-50"
              style={{ background: "var(--gradient-warm)" }}
            >
              {t("auth.signInBtn")} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between text-sm">
            <Link to="/reset-password" className="text-muted-foreground hover:text-foreground">{t("auth.forgot")}</Link>
            <Link to="/signup" className="font-semibold text-brand hover:underline">{t("auth.createAccount")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, type, placeholder, value, onChange }: {
  icon: React.ComponentType<{ className?: string }>;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-border bg-background pl-11 pr-4 py-3 text-[15px] placeholder:text-muted-foreground/60 focus:outline-none focus:border-brand transition-colors"
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
