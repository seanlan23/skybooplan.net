import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Lock, User as UserIcon, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { googleSignInHref } from "@/lib/auth.urls";
import { GoogleIcon } from "@/components/GoogleIcon";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create account — Skybooplan" },
      { name: "description", content: "Create your Skybooplan account to save AI travel plans, flights and stays." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useT();

  useEffect(() => {
    if (user) navigate({ to: "/", replace: true });
  }, [user, navigate]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { full_name: fullName },
      },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success(t("auth.createdToast"));
  };

  const handleGoogle = () => {
    setLoading(true);
    window.location.href = googleSignInHref();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: "var(--gradient-hero)" }}>
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center text-foreground">
          <Logo size="md" />
        </Link>

        <div className="rounded-3xl bg-card border border-border shadow-[var(--shadow-card)] p-8">
          <h1 className="text-2xl font-bold text-foreground">{t("auth.signupTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.signupSub")}</p>

          <button
            onClick={handleGoogle}
            disabled={loading}
            className="mt-6 w-full inline-flex items-center justify-center gap-3 rounded-2xl border border-border bg-background py-3 text-sm font-semibold hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <GoogleIcon /> {t("nav.signInGoogle")}
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> {t("auth.or")} <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <InputField icon={UserIcon} type="text" placeholder={t("auth.fullNamePh")} value={fullName} onChange={setFullName} />
            <InputField icon={Mail} type="email" placeholder={t("auth.emailPh")} value={email} onChange={setEmail} />
            <InputField icon={Lock} type="password" placeholder={t("auth.passwordMinPh")} value={password} onChange={setPassword} />
            <button
              type="submit"
              disabled={loading || !email || password.length < 8 || !fullName}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-primary-foreground shadow-md transition-all hover:shadow-lg disabled:opacity-50"
              style={{ background: "var(--gradient-warm)" }}
            >
              {t("auth.createAccount")} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="font-semibold text-brand hover:underline">{t("nav.signIn")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function InputField({ icon: Icon, type, placeholder, value, onChange }: {
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
